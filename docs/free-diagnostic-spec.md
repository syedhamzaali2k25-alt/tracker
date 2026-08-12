# Free Diagnostic — GraphQL Queries & Sheet Layout

This is the concrete build spec for **Part 1: The wake-up call (free)** from the margin
control concept — the read-only diagnostic that pulls a merchant's Shopify data and
produces a margin report. Nothing here writes to the store; it only reads three things:
products/variants, their cost, and the last 30 days of orders.

## Required scopes

- `read_products`
- `read_orders`
- `read_inventory` (cost lives on `InventoryItem`, not the variant)

## 1. Products + variants + cost

`InventoryItem.unitCost` holds "Cost per item." It's nested under
`variant.inventoryItem`, one level away from the variant itself. Paginate with
`first: 100` and `after` cursors on both products and variants — a variant-heavy
catalog can exceed 100 variants across very few products, so nested variant paging
matters as much as product paging.

```graphql
query ProductsWithCost($cursor: String) {
  products(first: 100, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      title
      status
      variants(first: 100) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          sku
          title
          price
          inventoryItem {
            id
            unitCost {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}
```

If a product ever has more than 100 variants (rare, but happens with large
size/color matrices), page `variants` with its own `after` cursor keyed to that
product's `id`.

## 2. Orders (last 30 days) — units sold per variant

Pull orders by date, walk `lineItems`, and aggregate `quantity` per
`variant.id`. Excluding refunded/cancelled orders keeps "units sold" honest —
a refunded sale shouldn't count as profit.

```graphql
query RecentOrders($cursor: String, $since: String!) {
  orders(
    first: 100
    after: $cursor
    query: $since
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      createdAt
      cancelledAt
      displayFinancialStatus
      lineItems(first: 100) {
        nodes {
          quantity
          variant {
            id
          }
          discountedUnitPriceSet {
            shopMoney {
              amount
            }
          }
        }
      }
    }
  }
}
```

`$since` is a search-query string, e.g. `"created_at:>=2026-07-13"` (today minus 30
days). Skip orders where `cancelledAt` is set. Sum `quantity` per `variant.id`
across all pages to get `Sold (30d)`.

## 3. Aggregation (per variant)

```
cost         = inventoryItem.unitCost.amount            (nullable)
price        = variant.price
margin_pct   = cost == null ? null : (price - cost) / price
units_sold   = sum(lineItem.quantity) over last-30d, non-cancelled orders
revenue_30d  = sum(lineItem.discountedUnitPriceSet.shopMoney.amount * quantity)
profit_30d   = cost == null ? null : (price - cost) * units_sold
```

Sort the resulting rows worst-margin-first (nulls last, since "unknown" isn't
"bad" — it's a separate category).

## 4. Google Sheet layout

One row per variant. Two tabs: `Diagnostic` (read-only report) and `Fix`
(the paid editable layer, added later — columns `New Price` / `New Cost` only
go live once Part 2 ships).

| Column | Source | Notes |
|---|---|---|
| Product | `product.title` | |
| Variant | `variant.title` | omit/blank if product has a single default variant |
| SKU | `variant.sku` | |
| Cost | `inventoryItem.unitCost.amount` | blank if null — do not coerce to 0 |
| Price | `variant.price` | |
| Margin % | computed | blank if Cost is blank; red if < 20%, red-bold if < 0% |
| Sold (30d) | computed from orders | |
| Revenue (30d) | computed from orders | |
| Profit (30d) | computed | blank if Cost is blank |
| Flag | computed | 🔴 below 20% margin · 🔴 below cost · ⚫ no cost data |
| Shopify Product ID | `product.id` | hidden column, needed later for Part 2 writes |
| Shopify Variant ID | `variant.id` | hidden column, needed later for Part 2 writes |

### Summary block (pinned rows above the table)

```
{count where margin < 20%} products are selling below 20% margin.
{count where margin < 0%} products are selling BELOW COST — you lost
  {sum(profit_30d) where profit_30d < 0, negated} {currency} in the last 30 days.
{count where cost is null} products have no cost recorded, so we can't check them.
```

## Rate limits / pagination notes

- Admin GraphQL API uses cost-based throttling. Both queries above stay well
  under the bucket at `first: 100`; back off with the `extensions.cost.throttleStatus`
  fields if the catalog is very large (several thousand products) and pages run
  back-to-back.
- Run the products query and the orders query independently, then join in
  memory by `variant.id` — don't try to nest orders inside the products query.
