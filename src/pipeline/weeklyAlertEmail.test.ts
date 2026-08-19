import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWeeklyAlertEmail } from "./weeklyAlertEmail.js";
import type { MarginRow } from "../types.js";

function marginRow(overrides: Partial<MarginRow>): MarginRow {
  return {
    productId: "p1",
    productTitle: "Test <Product>",
    variantId: "v1",
    variantTitle: "Default",
    sku: "SKU-1",
    inventoryItemId: "i1",
    cost: 500,
    price: 1000,
    currencyCode: "PKR",
    marginPct: -0.1,
    unitsSold30d: 0,
    revenue30d: 0,
    profit30d: -100,
    flag: "below-cost",
    ...overrides,
  };
}

test("subject counts total newly-flagged products and pluralizes correctly", () => {
  const one = buildWeeklyAlertEmail(
    "shop1.myshopify.com",
    { newlyBelowCost: [{ row: marginRow({}), previousFlag: "ok" }], newlyLowMargin: [] },
    "PKR",
  );
  assert.match(one.subject, /^Margin Tracker: 1 product newly flagged on shop1\.myshopify\.com$/);

  const two = buildWeeklyAlertEmail(
    "shop1.myshopify.com",
    {
      newlyBelowCost: [{ row: marginRow({}), previousFlag: "ok" }],
      newlyLowMargin: [{ row: marginRow({ variantId: "v2", flag: "low-margin" }), previousFlag: "ok" }],
    },
    "PKR",
  );
  assert.match(two.subject, /^Margin Tracker: 2 products newly flagged on/);
});

test("html escapes product titles instead of injecting raw markup", () => {
  const email = buildWeeklyAlertEmail(
    "shop1.myshopify.com",
    { newlyBelowCost: [{ row: marginRow({ productTitle: "Test <Product>" }), previousFlag: "ok" }], newlyLowMargin: [] },
    "PKR",
  );
  assert.ok(!email.html.includes("<Product>"));
  assert.ok(email.html.includes("&lt;Product&gt;"));
});

test("only includes a section for categories that actually have changes", () => {
  const email = buildWeeklyAlertEmail(
    "shop1.myshopify.com",
    { newlyBelowCost: [{ row: marginRow({}), previousFlag: "ok" }], newlyLowMargin: [] },
    "PKR",
  );
  assert.ok(email.text.includes("Newly selling below cost"));
  assert.ok(!email.text.includes("Newly below the margin threshold"));
});
