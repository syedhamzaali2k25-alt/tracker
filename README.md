# Margin Tracker

Finds which Shopify products are selling at a thin or negative margin, reports
it into a Google Sheet, and lets you push price/cost fixes back to Shopify
safely (preview + confirm + one-command undo).

See [`docs/free-diagnostic-spec.md`](docs/free-diagnostic-spec.md) for the
GraphQL queries and sheet layout this implements.

## Setup

1. **Shopify custom app** — in your dev store: Settings → Apps and sales
   channels → Develop apps → Create an app. Grant `read_products`,
   `read_orders`, `read_inventory`, `write_products`, `write_inventory`, then
   install it and copy the Admin API access token.
2. **Google service account** — in Google Cloud Console: create a project,
   enable the Google Sheets API, create a service account, download its JSON
   key. Create a Google Sheet and share it with the service account's email
   (Editor access).
3. Copy `.env.example` to `.env` and fill in both sets of credentials.
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
    runDiagnostic.ts            `npm run diagnostic`
    previewChanges.ts            `npm run preview`
    applyChanges.ts               `npm run apply`
    undo.ts                        `npm run undo`
    backup.ts, confirm.ts          shared helpers
```

## Not built yet

- Weekly automated re-check + email alert (the "watchman" subscription
  feature) — this repo is the on-demand CLI version.
- Multi-merchant OAuth / hosting — this targets a single store via a static
  access token, matching the recommended first step of building the
  single-store diagnostic before a real installable app.
