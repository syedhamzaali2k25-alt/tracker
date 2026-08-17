# Margin Tracker

Finds which Shopify products are selling at a thin or negative margin, reports
it into a Google Sheet, and lets you push price/cost fixes back to Shopify
safely (preview + confirm + one-command undo).

See [`docs/free-diagnostic-spec.md`](docs/free-diagnostic-spec.md) for the
GraphQL queries and sheet layout this implements.

## Setup

This root project is now the **CLI-only** path (`npm run diagnostic` /
`preview` / `apply` / `undo`) — the real installable app with per-shop OAuth
lives in [`app/`](#the-app-directory) and has its own setup steps.

1. **Shopify custom app** (for the CLI only — the app in `app/` doesn't use
   this) — in your dev store: Settings → Apps and sales channels → Develop
   apps → Create an app. Grant `read_products`, `read_orders`,
   `read_inventory`, `write_products`, `write_inventory`, then install it and
   copy the Admin API access token.
2. **Google service account** (used by both the CLI and the app) — in Google
   Cloud Console: create a project, enable the Google Sheets API, create a
   service account, download its JSON key. Create a Google Sheet and share it
   with the service account's email (Editor access).
3. Copy `.env.example` to `.env`, fill in the Google credentials, and
   uncomment/fill in `SHOPIFY_SHOP`/`SHOPIFY_ACCESS_TOKEN` if you want to use
   the CLI.
4. `npm install`

## Usage

Run these in order:

```bash
npm run diagnostic   # read-only: pulls products, cost, and 30-day sales,
                      # writes the Diagnostic + Fix tabs in your Sheet

# ...open the Sheet, look at the Diagnostic tab, fill in New Price / New
# Cost on the Fix tab for whatever you want to change...

npm run preview       # read-only: shows what would change and flags
                       # anything that would go below cost or hit 0

npm run apply          # prints the same preview, asks you to type YES,
                        # snapshots the old prices/costs to ./backups/,
                        # then writes the new prices/costs to Shopify

npm run undo            # restores the most recent backup snapshot
```

`apply` always snapshots before it writes anything, and always shows the
preview + confirmation prompt first — there is no flag to skip either step.

## What "margin" means here

This is **gross margin**: `(price - cost) / price`, using Shopify's current
"Cost per item" field. It does not subtract payment processing fees,
shipping, returns, or ad spend — treat it as a first pass at finding
obviously bad pricing, not a true net-profit number.

Cost is Shopify's *current* cost, not the cost at the time each historical
order was placed — if your supplier price changed recently, past profit
numbers will be slightly off.

## Project layout

```
src/
  config.ts              env var loading/validation
  types.ts                shared types
  shopify/
    client.ts              GraphQL fetch wrapper
    queries.ts              products+cost query, orders query, pagination
    mutations.ts             price + cost write-back mutations
  margin/
    calculate.ts             margin %, revenue/profit aggregation, sorting
  sheets/
    client.ts                 Google Sheets auth + read/write helpers
    diagnosticSheet.ts         Diagnostic + Fix tab layout and writing
    fixSheet.ts                 reads merchant-entered New Price/New Cost
  pipeline/
    runDiagnostic.ts, previewChanges.ts, applyChanges.ts, undo.ts
                                    exported functions, reused by the app
    backup.ts, devShopContext.ts   shared helpers
    cli/                           `npm run diagnostic/preview/apply/undo`
                                    entry points (see below)
```

Every Shopify-facing function (`fetchAllVariants`, `applyPriceUpdates`, etc.)
takes a `ShopContext { shop, accessToken }` as an explicit parameter — there's
no global "the current shop." The CLI builds one from
`SHOPIFY_SHOP`/`SHOPIFY_ACCESS_TOKEN` (`devShopContext.ts`); the app in
`app/` builds one from the authenticated OAuth session for each request.

The four `npm run diagnostic/preview/apply/undo` entry points live in
`pipeline/cli/`, separate from the functions they call, rather than each
pipeline file running itself when invoked directly (`if (import.meta.url ===
file://process.argv[1])`). That guard broke once the app started importing
these same pipeline files: bundling them all into one SSR server file made
the guard match the *bundle's* path, so every CLI script's `main()` —
including the one that writes prices to Shopify — ran automatically on every
server boot, using whatever `SHOPIFY_SHOP`/`SHOPIFY_ACCESS_TOKEN` happened to
be set. Keeping the CLI entry points in files the app never imports makes
that impossible by construction, not just by careful coding.

## Not built yet

- Weekly automated re-check + email alert (the "watchman" subscription
  feature).
- Google OAuth per merchant — Sheets access still uses a single shared
  service account and a single `GOOGLE_SHEET_ID`, for both the CLI and the
  app. Shopify access is now per-shop OAuth (see below); Google isn't yet.
- History/undo in the app's UI, scheduled re-check, and deployment — see the
  phase notes in `app/`'s own history for what's planned next.

## The `app/` directory

`app/` is a separate npm project: Shopify's official React Router app
template (`shopify-app-template-react-router`), fetched directly rather than
through `shopify app init` since that command requires an interactive login
to a Shopify Partner/organization account. It has its own `package.json`,
`tsconfig.json`, and dependencies — it does not share this root project's
`npm install` or `npm test`.

The margin/Shopify/Sheets logic in `src/` is reused from inside `app/` via a
`~lib/*` path alias (`app/tsconfig.json`) pointing at `../src/*`, rather than
being duplicated.

### Authentication

The app authenticates each shop via real OAuth (not the CLI's static
token) — install flow, session storage, the works. Sessions are stored in
SQLite via Prisma (`app/prisma/schema.prisma`), wrapped in an encrypting
layer (`app/app/encrypted-session-storage.server.ts`) so access tokens are
never written to disk in plaintext. That wrapper needs one more env var in
`app/.env`:

```bash
SESSION_ENCRYPTION_KEY=<64 hex chars>
# generate one with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The five scopes the app requests during OAuth (`read_products`,
`read_orders`, `read_inventory`, `write_products`, `write_inventory`) are
declared in `app/app/scopes.server.ts`, kept in sync by hand with
`shopify.app.toml`'s `[access_scopes]` (the file `shopify app deploy`
registers with Shopify) — there's no `SCOPES` env var. If you add a scope,
update both files.

Every route builds a `ShopContext` from `session.shop` /
`session.accessToken` for that request — never from a global — and that's
the only place an access token exists in memory outside the encrypted
session store. It's never logged and never sent to the browser.

### GDPR webhooks

`customers/data_request`, `customers/redact`, and `shop/redact` are wired up
(`app/app/routes/webhooks.*.tsx`) and declared in `shopify.app.toml`. The
first two are no-ops — this app never stores customer PII. `shop/redact`
(and the existing `app/uninstalled` handler) delete that shop's session(s)
and its cached diagnostic (`app/app/diagnostic-cache.server.ts`, now a
Prisma model instead of the in-memory Map from earlier phases).

To work on it:

```bash
cd app
npm install   # already done once during scaffolding, but harmless to rerun
npx prisma migrate dev   # applies the Session + DiagnosticCache migrations
npm run dev   # runs `shopify app dev` — requires you to be logged into
              # your Shopify Partner account; it will prompt to log in
              # and to link this project to an app in your organization
```
