import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPreview } from "./previewChanges.js";
import type { FixEntry } from "../sheets/fixSheet.js";

function entry(overrides: Partial<FixEntry>): FixEntry {
  return {
    productTitle: "Test Product",
    variantTitle: "Default",
    productId: "p1",
    variantId: "v1",
    inventoryItemId: "i1",
    currentPrice: 100,
    currentCost: 50,
    newPrice: null,
    newCost: null,
    ...overrides,
  };
}

test("counts entries and finds biggest increase/decrease", () => {
  const preview = buildPreview([
    entry({ currentPrice: 100, newPrice: 134 }), // +34%
    entry({ currentPrice: 100, newPrice: 88 }), // -12%
  ]);

  assert.equal(preview.count, 2);
  assert.ok(Math.abs(preview.biggestIncreasePct - 34) < 0.01);
  assert.ok(Math.abs(preview.biggestDecreasePct - -12) < 0.01);
});

test("flags a row that would end up below its cost after the change", () => {
  const preview = buildPreview([entry({ currentPrice: 100, currentCost: 50, newPrice: 40 })]);
  assert.equal(preview.belowCostAfterChange.length, 1);
});

test("flags a row that would become 0 price", () => {
  const preview = buildPreview([entry({ currentPrice: 100, newPrice: 0 })]);
  assert.equal(preview.zeroPriceAfterChange.length, 1);
});

test("a cost-only change is still checked against the unchanged price", () => {
  const preview = buildPreview([entry({ currentPrice: 100, currentCost: 50, newCost: 150 })]);
  assert.equal(preview.belowCostAfterChange.length, 1);
});

test("no flags when the new price stays comfortably above cost", () => {
  const preview = buildPreview([entry({ currentPrice: 100, currentCost: 50, newPrice: 120 })]);
  assert.equal(preview.belowCostAfterChange.length, 0);
  assert.equal(preview.zeroPriceAfterChange.length, 0);
});
