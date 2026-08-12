import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMarginRows, summarize } from "./calculate.js";
import type { VariantRow } from "../types.js";
import type { VariantSales } from "../shopify/queries.js";

const variants: VariantRow[] = [
  { productId: "p1", productTitle: "Blue Shirt M", variantId: "v1", variantTitle: "M", sku: "BS-M", inventoryItemId: "i1", cost: 1000, price: 1150, currencyCode: "PKR" },
  { productId: "p2", productTitle: "Red Cap", variantId: "v2", variantTitle: "Default", sku: "RC", inventoryItemId: "i2", cost: 400, price: 900, currencyCode: "PKR" },
  { productId: "p3", productTitle: "Black Jeans", variantId: "v3", variantTitle: "32", sku: "BJ-32", inventoryItemId: "i3", cost: 2200, price: 2100, currencyCode: "PKR" },
  { productId: "p4", productTitle: "Grey Hoodie", variantId: "v4", variantTitle: "L", sku: "GH-L", inventoryItemId: "i4", cost: null, price: 3000, currencyCode: "PKR" },
];

const sales = new Map<string, VariantSales>([
  ["v1", { unitsSold: 84, revenue: 84 * 1150 }],
  ["v2", { unitsSold: 30, revenue: 30 * 900 }],
  ["v3", { unitsSold: 45, revenue: 45 * 2100 }],
  ["v4", { unitsSold: 12, revenue: 12 * 3000 }],
]);

test("sorts worst margin first, no-cost rows last", () => {
  const rows = calculateMarginRows(variants, sales, 0.2);
  assert.equal(rows[0].productTitle, "Black Jeans");
  assert.equal(rows.at(-1)!.productTitle, "Grey Hoodie");
});

test("flags below-cost, low-margin, ok, and no-cost correctly", () => {
  const rows = calculateMarginRows(variants, sales, 0.2);
  const byTitle = Object.fromEntries(rows.map((r) => [r.productTitle, r]));

  assert.equal(byTitle["Black Jeans"].flag, "below-cost");
  assert.equal(byTitle["Blue Shirt M"].flag, "low-margin");
  assert.equal(byTitle["Red Cap"].flag, "ok");
  assert.equal(byTitle["Grey Hoodie"].flag, "no-cost");
  assert.equal(byTitle["Grey Hoodie"].marginPct, null);
});

test("computes 30-day profit as (price - cost) * units sold", () => {
  const rows = calculateMarginRows(variants, sales, 0.2);
  const blackJeans = rows.find((r) => r.productTitle === "Black Jeans")!;
  assert.equal(blackJeans.profit30d, -4500);

  const redCap = rows.find((r) => r.productTitle === "Red Cap")!;
  assert.equal(redCap.profit30d, 15000);
});

test("summarize matches counts and total below-cost loss", () => {
  const rows = calculateMarginRows(variants, sales, 0.2);
  const summary = summarize(rows);

  assert.equal(summary.lowMarginCount, 2); // Blue Shirt (13%) + Black Jeans (-5%)
  assert.equal(summary.belowCostCount, 1);
  assert.equal(summary.belowCostLoss, 4500);
  assert.equal(summary.noCostCount, 1);
  assert.equal(summary.currencyCode, "PKR");
});

test("a variant with no sales in the lookback window still gets a row", () => {
  const noSales = new Map<string, VariantSales>();
  const rows = calculateMarginRows(variants, noSales, 0.2);
  for (const row of rows) {
    assert.equal(row.unitsSold30d, 0);
    assert.equal(row.revenue30d, 0);
  }
});
