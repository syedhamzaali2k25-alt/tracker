import assert from "node:assert/strict";
import { test } from "node:test";
import { diffMarginRows, hasChanges } from "./weeklyDiff.js";
import type { MarginRow } from "../types.js";

function marginRow(overrides: Partial<MarginRow>): MarginRow {
  return {
    productId: "p1",
    productTitle: "Test Product",
    variantId: "v1",
    variantTitle: "Default",
    sku: "SKU-1",
    inventoryItemId: "i1",
    cost: 500,
    price: 1000,
    currencyCode: "PKR",
    marginPct: 0.5,
    unitsSold30d: 0,
    revenue30d: 0,
    profit30d: 500,
    flag: "ok",
    ...overrides,
  };
}

test("a variant that stays ok produces no changes", () => {
  const previous = [marginRow({ flag: "ok" })];
  const current = [marginRow({ flag: "ok" })];
  const diff = diffMarginRows(previous, current);
  assert.equal(hasChanges(diff), false);
});

test("a variant crossing from ok to below-cost is reported", () => {
  const previous = [marginRow({ flag: "ok" })];
  const current = [marginRow({ flag: "below-cost", marginPct: -0.1 })];
  const diff = diffMarginRows(previous, current);
  assert.equal(diff.newlyBelowCost.length, 1);
  assert.equal(diff.newlyBelowCost[0].previousFlag, "ok");
  assert.equal(diff.newlyLowMargin.length, 0);
});

test("a variant crossing from ok to low-margin is reported", () => {
  const previous = [marginRow({ flag: "ok" })];
  const current = [marginRow({ flag: "low-margin", marginPct: 0.05 })];
  const diff = diffMarginRows(previous, current);
  assert.equal(diff.newlyLowMargin.length, 1);
  assert.equal(diff.newlyBelowCost.length, 0);
});

test("a variant already below-cost last week is not reported again", () => {
  const previous = [marginRow({ flag: "below-cost", marginPct: -0.1 })];
  const current = [marginRow({ flag: "below-cost", marginPct: -0.2 })];
  const diff = diffMarginRows(previous, current);
  assert.equal(hasChanges(diff), false);
});

test("a variant escalating from low-margin to below-cost is reported as newly below-cost", () => {
  const previous = [marginRow({ flag: "low-margin", marginPct: 0.05 })];
  const current = [marginRow({ flag: "below-cost", marginPct: -0.1 })];
  const diff = diffMarginRows(previous, current);
  assert.equal(diff.newlyBelowCost.length, 1);
  assert.equal(diff.newlyBelowCost[0].previousFlag, "low-margin");
  assert.equal(diff.newlyLowMargin.length, 0);
});

test("a variant recovering from below-cost to ok produces no changes", () => {
  const previous = [marginRow({ flag: "below-cost", marginPct: -0.1 })];
  const current = [marginRow({ flag: "ok", marginPct: 0.5 })];
  const diff = diffMarginRows(previous, current);
  assert.equal(hasChanges(diff), false);
});

test("a brand new variant that debuts below-cost is reported (no previous run)", () => {
  const diff = diffMarginRows(undefined, [marginRow({ flag: "below-cost", marginPct: -0.1 })]);
  assert.equal(diff.newlyBelowCost.length, 1);
  assert.equal(diff.newlyBelowCost[0].previousFlag, null);
});

test("a variant no longer present this week (deleted) is not reported", () => {
  const previous = [marginRow({ variantId: "v1", flag: "ok" }), marginRow({ variantId: "v2", flag: "ok" })];
  const current = [marginRow({ variantId: "v1", flag: "ok" })];
  const diff = diffMarginRows(previous, current);
  assert.equal(hasChanges(diff), false);
});

test("no-cost never counts as a change even after being below-cost", () => {
  const previous = [marginRow({ flag: "below-cost", marginPct: -0.1 })];
  const current = [marginRow({ flag: "no-cost", marginPct: null, cost: null })];
  const diff = diffMarginRows(previous, current);
  assert.equal(hasChanges(diff), false);
});
