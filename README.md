# Margin Tracker

Finds which Shopify products are selling at a thin or negative margin, reports
it into a Google Sheet in the merchant's own Drive, and lets you push
price/cost fixes back to Shopify safely (preview + confirm + a History page
with per-push undo).

See [`docs/free-diagnostic-spec.md`](docs/free-diagnostic-spec.md) for the
GraphQL queries and sheet layout this implements.

## Setup

This root project is now a **Shopify-only CLI** (`npm run diagnostic`) plus
the shared library the real app reuses — Google Sheets access moved to
per-merchant OAuth, which needs a browser, so `preview`/`apply`/`undo`'s
Sheet-reading steps only work from the installed app now (see
[`app/`](#the-app-directory), which has its own setup steps).

1. **Shopify custom app** (for the CLI only — the app in `app/` doesn't use
   this) — in your dev store: Settings → Apps and sales channels → Develop
   apps → Create an app. Grant `read_products`, `read_orders`,
   `read_inventory`, `write_products`, `write_inventory`, then install it and
   copy the Admin API access token.
2. Copy `.env.example` to `.env` and uncomment/fill in
   `SHOPIFY_SHOP`/`SHOPIFY_ACCESS_TOKEN`.
3. `npm install`

## Usage

```bash
npm run diagnostic   # read-only: pulls products, cost, and 30-day sales,
                      # prints the results (below-cost/low-margin counts,
                      # amount lost) to the console
```

`npm run preview`, `npm run apply`, and `npm run undo` all print an
explanation and exit non-zero now: reading the Fix tab means reading a Google
Sheet connected via per-merchant OAuth (needs a real browser to authorize),
and push batches — the before-values saved by each "Push changes" run — live
per shop in the app's database rather than as files on whatever machine ran
the apply. Use the app instead: its "Push changes" button previews the same
way before asking you to confirm, and its History page lists every past
batch with an Undo button.

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
    client.ts                 Sheets read/write helpers, takes a GoogleContext
    googleAuth.ts               OAuth client, auth URL, token exchange,
                                  state signing (shared with the app)
    diagnosticSheet.ts         Diagnostic + Fix tab layout and writing
    fixSheet.ts                 reads merchant-entered New Price/New Cost
  pipeline/
    runDiagnostic.ts, previewChanges.ts, applyChanges.ts, undo.ts
                                    exported functions, reused by the app —
                                    applyChanges()/undoBatch() take a
                                    PushBatchRecorder/entries the app supplies
                                    rather than touching a database directly
    devShopContext.ts              shared CLI helper
    cli/                           `npm run diagnostic/preview/apply/undo`
                                    entry points (see below)
```

Every Shopify-facing function (`fetchAllVariants`, `applyPriceUpdates`, etc.)
takes a `ShopContext { shop, accessToken }` as an explicit parameter — there's
no global "the current shop." The CLI builds one from
`SHOPIFY_SHOP`/`SHOPIFY_ACCESS_TOKEN` (`devShopContext.ts`); the app in
`app/` builds one from the authenticated OAuth session for each request.

Every Sheets-facing function (`writeDiagnostic`, `readFixEntries`, etc.) takes
a `GoogleContext { auth, spreadsheetId }` the same way — `auth` is an OAuth2
client built from a merchant's stored refresh token, `spreadsheetId` is the
sheet the app created in their Drive. There's no CLI equivalent of
`devShopContext.ts` for Google: connecting requires a browser, so only the
app can build one (see `app/app/google-auth.server.ts`).

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
- Scheduled re-check and deployment — see the phase notes in `app/`'s own
  history for what's planned next.

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

### Google Sheets access

Each merchant connects their own Google account — there's no shared service
account or `GOOGLE_SHEET_ID` anymore. From the dashboard's "Connect Google"
link, OAuth requests just
[`drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
not the broader `spreadsheets` scope: the app only ever creates the
spreadsheet it writes to and never asks a merchant to point it at an existing
one, so per-file access to files the app itself created is enough, and a
compromised token can't read or touch anything else in their Drive. The
refresh token is encrypted (`app/app/crypto.server.ts`, the same AES-256-GCM
scheme sessions use) and stored per shop
(`app/app/google-account.server.ts`), alongside the ID of the spreadsheet
created the first time that shop clicked "Create sheet."

Set up a Google Cloud OAuth client (APIs & Services → Credentials → Create
OAuth client ID → Web application), enable the Google Sheets API and Google
Drive API on that project, and add these to `app/.env`:

```bash
GOOGLE_OAUTH_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxxx
```

Add `${SHOPIFY_APP_URL}/auth/google/callback` as an authorized redirect URI
on that OAuth client — that URL is computed from `SHOPIFY_APP_URL` (already
required for Shopify OAuth), not a separate env var, so it stays correct
whenever the tunnel URL changes during local dev.

If a merchant's refresh token gets revoked (they remove the app's access in
their Google account, or it simply expires), the next Sheets call fails with
Google's `invalid_grant` error; the app catches that specifically
(`isGoogleReauthError`), clears the stored refresh token — keeping the
spreadsheetId link so reconnecting resumes the same sheet instead of
creating a new one — and the dashboard falls back to the "Connect Google"
empty state instead of showing a crash.

### Push history and undo

Every `applyChanges()` run (the "Push changes" flow) writes a `PushBatch` row
— shop, timestamp, change count, and the before-values for every variant it's
about to touch — *before* making any Shopify writes, so even a run that fails
partway through leaves a record of what it was about to change
(`app/prisma/schema.prisma`, written via `app/app/push-batch.server.ts`).
`applyChanges()` itself never touches Prisma directly: it takes a
`PushBatchRecorder` the app supplies, the same way it already takes a
`ShopContext` instead of assuming a global "current shop."

The History page (`app/app/routes/app.history.tsx`) lists a shop's batches
newest first, with a date, change count, and status per row. Undo asks for
confirmation in a modal, then calls `undoBatch()` (`src/pipeline/undo.ts`)
with that specific batch's saved entries and marks the batch `reverted` in
the database so it can't be applied a second time. `getPushBatch()` scopes
every lookup to the requesting shop, so one merchant can't undo another's
batch by ID even if they had one. Restoring a null cost back to "no cost
recorded" uses the same `costClearFailed()` check as a normal apply
(`src/shopify/mutations.ts`) — Shopify's cost-clear mutation can silently
no-op, so undo verifies the clear actually took effect instead of trusting
the request succeeded.

### GDPR webhooks

`customers/data_request`, `customers/redact`, and `shop/redact` are wired up
(`app/app/routes/webhooks.*.tsx`) and declared in `shopify.app.toml`. The
first two are no-ops — this app never stores customer PII. `shop/redact`
(and the existing `app/uninstalled` handler) delete that shop's session(s),
its cached diagnostic (`app/app/diagnostic-cache.server.ts`), its Google
connection (`app/app/google-account.server.ts`) — refresh token and
spreadsheetId link both gone, not just invalidated — and its push batch
history (`app/app/push-batch.server.ts`).

To work on it:

```bash
cd app
npm install   # already done once during scaffolding, but harmless to rerun
npx prisma migrate dev   # applies the Session/DiagnosticCache/GoogleAccount/PushBatch migrations
npm run dev   # runs `shopify app dev` — requires you to be logged into
              # your Shopify Partner account; it will prompt to log in
              # and to link this project to an app in your organization
```
