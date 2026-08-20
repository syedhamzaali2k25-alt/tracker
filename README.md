# Margin Tracker

Finds which Shopify products are selling at a thin or negative margin, reports
it into a Google Sheet in the merchant's own Drive, and lets you push
price/cost fixes back to Shopify safely (preview + confirm + undo any past
push from a History page).

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
explanation and exit non-zero instead of doing anything: reading the Fix tab
means reading a Google Sheet connected via per-merchant OAuth (needs a real
browser to authorize), and push history now lives in the app's database, not
a local `./backups/` folder — both only work from the installed app now. Use
its "Push changes" button and History page instead.

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
    sheetFormatting.ts          formatting requests for both tabs (see below)
    fixSheet.ts                 reads merchant-entered New Price/New Cost
  pipeline/
    runDiagnostic.ts, previewChanges.ts, applyChanges.ts, undo.ts
                                    exported functions, reused by the app
    weeklyDiff.ts                  pure week-over-week margin diff
    weeklyAlertEmail.ts            builds the alert email's subject/text/html
    devShopContext.ts              CLI-only ShopContext fallback
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

`applyChanges()` takes a third `saveBatch` parameter the same way, rather
than importing a way to persist a snapshot itself — it's a plain
`(shop, entries) => Promise<batchId>` function, backed by a database table
in the app (`app/app/push-batches.server.ts`) instead of anything in `src/`,
since this shared pipeline code has no database of its own to reach for.

Both tabs are formatted (bold/frozen header, currency/percent number
formats, column widths, protected + validated + conditionally-formatted
Fix columns) via `sheetFormatting.ts`, but only the first time a tab exists
or after a deliberate code change bumps its format version — not on every
plain diagnostic sync, which would resend the whole formatting batch for no
visible change every single time. That's tracked with spreadsheet-invisible
[developer
metadata](https://developers.google.com/workspace/sheets/api/guides/metadata)
(a version string stashed on the sheet itself, outside any cell a merchant
could see or accidentally overwrite) rather than anything in this app's own
database, so it stays correct even for a spreadsheet nothing else here has
state about. Below-cost highlighting on both tabs is a conditional format
rule, not per-row cell coloring — it re-evaluates from the cell values
themselves on every future sync, so it never needs reapplying either.

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

### Environment variables

Every variable the deployed app reads, in one place. Set these wherever you
deploy (Railway/Render/Fly's dashboard or CLI) — `app/.env` (copy from
`app/.env.example`) is only for local dev, and is never read in production
(nothing loads dotenv there; the host injects real process env vars
instead).

| Variable | Required | What it's for |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string (`postgresql://user:pass@host:5432/db`). Your host's Postgres add-on provides this. |
| `SHOPIFY_API_KEY` | Yes | From `shopify.app.toml`'s `client_id` / the Partner Dashboard's app credentials. |
| `SHOPIFY_API_SECRET` | Yes | The matching client secret, Partner Dashboard → app → API credentials. |
| `SHOPIFY_APP_URL` | Yes | The app's public URL. Also used to derive the Google OAuth redirect URI (`${SHOPIFY_APP_URL}/auth/google/callback`) — no separate var for that. |
| `SESSION_ENCRYPTION_KEY` | Yes | 64 hex chars (32 bytes). Encrypts Shopify session tokens and Google refresh tokens at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Losing/rotating this invalidates every stored session and Google connection — merchants would need to reinstall/reconnect. |
| `GOOGLE_OAUTH_CLIENT_ID` | Yes | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Yes | The matching secret from that same OAuth client. |
| `SENDGRID_API_KEY` | Cron service only | SendGrid → Settings → API Keys → Create API Key, "Restricted Access" with only "Mail Send" permission. Only the weekly-check cron service sends email; the web service never needs this. |
| `EMAIL_FROM` | Cron service only | The single sender address you verified in SendGrid (Settings → Sender Authentication → Single Sender Verification — no domain needed, see "Weekly margin alerts" below). Must match exactly what you verified. |
| `SHOP_CUSTOM_DOMAIN` | No | Only if you support a merchant's custom domain on the storefront side; see the Shopify template's own docs. Unset by default. |
| `PORT` | No | `@react-router/serve` listens on this; your host sets it automatically (Railway/Render/Fly all do). Defaults to 3000 if unset. |
| `NODE_ENV` | No | Already set to `production` in the Dockerfile; most hosts also set this themselves. |
| `SHOPIFY_API_VERSION` | No | Shopify Admin API version the GraphQL client targets (`src/config.ts`). Defaults to `2026-07`. |
| `LOOKBACK_DAYS` | No | How many days of orders "units sold" aggregates over. Defaults to `30`. |
| `LOW_MARGIN_THRESHOLD` | No | Margin % below which a product is flagged. Defaults to `0.20`. |

### Authentication

The app authenticates each shop via real OAuth (not the CLI's static
token) — install flow, session storage, the works. Sessions are stored in
Postgres via Prisma (`app/prisma/schema.prisma`), wrapped in an encrypting
layer (`app/app/encrypted-session-storage.server.ts`) so access tokens are
never written to disk in plaintext — that's what `SESSION_ENCRYPTION_KEY`
above is for.

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
Drive API on that project, and set `GOOGLE_OAUTH_CLIENT_ID`/
`GOOGLE_OAUTH_CLIENT_SECRET` (see the table above). Add
`${SHOPIFY_APP_URL}/auth/google/callback` as an authorized redirect URI on
that OAuth client — that URL is computed from `SHOPIFY_APP_URL`, not a
separate env var, so it stays correct whenever the tunnel URL changes
during local dev or the app moves hosts.

If a merchant's refresh token gets revoked (they remove the app's access in
their Google account, or it simply expires), the next Sheets call fails with
Google's `invalid_grant` error; the app catches that specifically
(`isGoogleReauthError`), clears the stored refresh token — keeping the
spreadsheetId link so reconnecting resumes the same sheet instead of
creating a new one — and the dashboard falls back to the "Connect Google"
empty state instead of showing a crash.

### Push history

Every `applyChanges()` run saves a `PushBatch` row — shop, timestamp, how
many variants it touched, and the price/cost each of those variants had
right before the push — before writing anything to Shopify
(`app/app/push-batches.server.ts`). This replaced the old filesystem
snapshots in `./backups/`: a database row survives across machines and
deploys, is naturally scoped per shop, and lets the app list every past
push instead of only ever being able to restore "the latest one."

The dashboard's History page (`app/app/routes/app.history.tsx`) lists a
shop's batches newest-first with an Undo button on each. Undo asks for
confirmation in a modal, then calls the same `undoBatch()` used by the old
CLI `undo` command — including the same null-cost handling (a variant with
no cost recorded before the push gets its cost *cleared* back to "not
recorded" on undo, not set to a stray value like 0). A batch is marked
`reverted` once undone so its Undo button can't be used a second time,
which would silently re-apply stale "before" values on top of whatever's
changed since.

### Weekly margin alerts

A separate script (`app/app/cron/weeklyCheck.server.ts`, run via
`npm run cron:weekly-check`) re-runs the diagnostic for every currently
installed shop, compares it to that shop's own previous run
(`app/app/watchman-run.server.ts` — a `WatchmanRun` row per shop, kept
separate from the dashboard's `DiagnosticCache` so an ad-hoc "Sync" click
doesn't skew the week-over-week baseline), and emails the merchant only
when something **newly** crossed into below-cost or under the margin
threshold — not a full re-report every week. The diffing itself
(`src/pipeline/weeklyDiff.ts`) is a pure function: given last week's rows
and this week's, keyed by variant ID, it returns exactly the variants whose
flag just became `below-cost` or `low-margin` (a variant already in either
state stays quiet; a brand new variant that debuts already bad still gets
reported).

It's a plain script, not an HTTP route, run as its own Railway Cron Job
service on a weekly schedule — see "Deploying" below for the exact setup.
Shops are processed one at a time in a `for` loop with a `try`/`catch`
around each: one shop's Shopify API error, missing Google connection, or
SendGrid failure is logged and skipped, never aborting the shops after it.
Rate limiting isn't reimplemented here — `runDiagnostic()` calls the same
`shopifyGraphQL()` wrapper the rest of the app uses, which already tracks
each shop's own cost-based throttle bucket and backs off automatically
(Phase 0.4); running shops sequentially rather than concurrently means
there's never more than one shop's worth of Shopify traffic in flight at
once.

**Two decisions made here, not left as defaults to stumble into:**

- **Email provider: SendGrid**, using its plain REST API directly
  (`app/app/email.server.ts`) rather than the `@sendgrid/mail` SDK — a
  single JSON POST didn't need a dependency for it. SendGrid's free tier
  (100 emails/day, no expiry) needs only **Single Sender Verification** —
  confirm ownership of one specific "from" address by clicking a link
  SendGrid emails to it — not a verified domain, matching the constraint.
  Other providers considered: Resend and Mailgun's no-domain sandbox modes
  only deliver to the account owner's own address, not arbitrary merchant
  inboxes, which doesn't work for this; Postmark supports the same
  single-sender approach but its free tier is a one-time 100-email trial
  rather than an ongoing daily allowance.
- **Where the merchant's email comes from: the shop's Shopify account
  email by default, with an optional override.** A Settings page
  (`app/app/routes/app.settings.tsx`) was already needed for the emails-off
  toggle, so adding one more optional field there to redirect alerts
  somewhere else (an ops inbox, distribution list) is barely more work and
  clearly better than assuming the Shopify signup address is where a
  merchant wants automated alerts to land. `getShopSettings()`'s
  `alertEmail` is `null` unless they've set one, and the job falls back to
  `shop.email` (`fetchShopEmail()`, a plain `shop { email }` GraphQL query
  — no extra scope needed) in that case.

The Settings page's checkbox controls `ShopSettings.emailAlerts`
(`app/app/shop-settings.server.ts`), checked by default. Turning it off
still lets the weekly job run and update the `WatchmanRun` baseline —
only the email send is skipped — so re-enabling it later compares against
an up-to-date baseline instead of dumping everything that changed while it
was off.

### GDPR webhooks

`customers/data_request`, `customers/redact`, and `shop/redact` are wired up
(`app/app/routes/webhooks.*.tsx`) and declared in `shopify.app.toml`. The
first two are no-ops — this app never stores customer PII. `shop/redact`
(and the existing `app/uninstalled` handler) delete that shop's session(s),
its cached diagnostic (`app/app/diagnostic-cache.server.ts`), its Google
connection (`app/app/google-account.server.ts` — refresh token and
spreadsheetId link both gone, not just invalidated), its push history
(`app/app/push-batches.server.ts`), its email settings
(`app/app/shop-settings.server.ts`), and its weekly-check baseline
(`app/app/watchman-run.server.ts`). An uninstalled shop also has no
`Session` row left, which is what keeps it out of the weekly job's shop
list in the first place (see "Weekly margin alerts" above).

To work on it:

```bash
cd app
npm install   # already done once during scaffolding, but harmless to rerun
npx prisma migrate dev   # applies migrations against your local Postgres —
                          # see "Deploying" below for how to get one running
npm run dev   # runs `shopify app dev` — requires you to be logged into
              # your Shopify Partner account; it will prompt to log in
              # and to link this project to an app in your organization
```

### Deploying

**Railway** is the pick here, over Render or Fly. All three can run a
Node/Postgres app fine, but the deciding factor is the still-unbuilt Phase 5
weekly re-check: it needs a real cron schedule (once a week, not "roughly
periodically"), running as its own process against the same codebase and
database.

- **Railway** has a first-class Cron Job service type: point it at this repo
  with a different start command and a cron expression, and it runs on
  schedule, then exits — billed only for the seconds it runs, no
  always-on worker needed. Straightforward Postgres add-on, Dockerfile
  builds supported natively.
- **Render** also has a native Cron Jobs resource — equally capable — but
  it's gated to paid plans (no free-tier cron), and its Postgres and cron
  are configured as more separate, more clicks-in-the-dashboard pieces than
  Railway's single project holding both.
- **Fly.io** has no first-party cron resource. The closest thing is a
  Fly Machine's built-in `schedule` field (`hourly`/`daily`/`monthly`) —
  coarser than a real cron expression, so a *weekly* job means running it
  daily and having the job itself check "is today the right day," or
  reaching for an external trigger (e.g. a GitHub Actions cron hitting a
  webhook route). Doable, but it's the one place Fly is a worse fit for
  what this app specifically needs.

None of that changes if you'd rather use Render — the app itself doesn't
care which host runs it, this is purely about which one makes the
scheduled-job piece easiest.

**Steps (Railway):**

1. Create a Postgres database in your Railway project — this gives you
   `DATABASE_URL` automatically as a reference variable.
2. Add a second service from the same GitHub repo for the web app. In its
   settings:
   - **Root Directory**: the repo root (leave unset / `.`) — **not** `app/`.
     `app/tsconfig.json`'s `~lib/*` alias resolves to `../src/*`, and that
     code's own dependencies (`dotenv`, `googleapis`) resolve against the
     repo root's `node_modules`, not `app/`'s. The Dockerfile needs the
     whole monorepo as build context to see any of that — see the comment
     at the top of `app/Dockerfile` for exactly what breaks if you get this
     wrong (it's not hypothetical; a repo-root-only build context fails
     with "Rollup failed to resolve import googleapis").
   - **Dockerfile Path**: `app/Dockerfile`.
   - Railway auto-detects `app/railway.json` for the build settings and
     health check path once it finds the Dockerfile there.
3. Set the environment variables from the table above on the web service
   (reference the Postgres service's `DATABASE_URL` rather than
   copy-pasting it, so it stays correct if the database ever moves).
4. Deploy. The image's `CMD` is `npm run docker-start`, which runs
   `prisma generate && prisma migrate deploy` — applying committed
   migrations in order, non-interactively, failing loudly on conflicts —
   **before** starting the server. It never runs `prisma db push`, which
   doesn't create migration history and isn't appropriate for a database
   holding real merchant data.
5. Point `SHOPIFY_APP_URL` at Railway's public domain for this service, set
   `application_url` and `[auth] redirect_urls` in `shopify.app.toml` to
   match (this repo's `shopify.app.toml` doesn't have those two yet — it's
   never been linked to a real Partner Dashboard app via `shopify app config
   link`, only scaffolded), then run `shopify app deploy` to push that
   config to Shopify.
6. Confirm `GET /health` returns `200 ok` — it pings the database
   (`SELECT 1`) rather than just confirming the process is alive, so a bad
   `DATABASE_URL` or an unreachable Postgres fails the check instead of the
   deploy going live unable to serve a single real request. Railway polls
   this automatically once `railway.json`'s `healthcheckPath` is picked up.

**Steps (weekly margin alerts, Railway Cron Job):**

1. In the same Railway project, add a service from the same GitHub repo —
   same **Root Directory** (repo root, not `app/`) and **Dockerfile Path**
   (`app/Dockerfile`) as the web service, same reasoning as step 2 above.
2. Set its **Service Type** to **Cron Job** (Railway's dashboard offers this
   per-service) with a weekly schedule, e.g. `0 9 * * 1` for Monday 9am UTC.
3. Override its **Start Command** to `npm run cron:weekly-check` instead of
   the image's default `npm run docker-start` CMD — Railway lets you set a
   custom start command per service without changing the Dockerfile. This
   runs `prisma migrate deploy` again (safe — Prisma's migration lock
   handles two services applying migrations concurrently without
   conflict) before the check, then exits; Railway's Cron Job billing only
   charges for the seconds it actually runs.
4. Give this service the same `DATABASE_URL` as the web service (reference
   the same Postgres service — don't duplicate the database), plus
   `SHOPIFY_API_KEY`/`SHOPIFY_API_SECRET`/`SESSION_ENCRYPTION_KEY` (needed
   to decrypt session access tokens) and `SENDGRID_API_KEY`/`EMAIL_FROM`
   (not needed by the web service, only this one).
5. Trigger it once manually from Railway's dashboard after setup to confirm
   it runs cleanly before waiting a week to find out.
