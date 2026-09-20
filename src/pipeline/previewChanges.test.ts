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
    newTitle: null,
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

test("a title-only change appears in titleChanges", () => {
  const preview = buildPreview([
    entry({ productId: "p1", productTitle: "Old Name", newTitle: "New Name" }),
  ]);
  assert.deepEqual(preview.titleChanges, [
    { productId: "p1", oldTitle: "Old Name", newTitle: "New Name" },
  ]);
});

test("a New Title matching the current title produces no title change", () => {
  const preview = buildPreview([entry({ productTitle: "Same Name", newTitle: "Same Name" })]);
  assert.equal(preview.titleChanges.length, 0);
});

test("titleChanges is deduped by product: two variant rows of the same product only contribute one entry", () => {
  const preview = buildPreview([
    entry({ productId: "p1", variantId: "v1", productTitle: "Old Name", newTitle: "New Name" }),
    entry({ productId: "p1", variantId: "v2", productTitle: "Old Name", newTitle: "New Name" }),
  ]);
  assert.equal(preview.titleChanges.length, 1);
});

test("titleChanges keeps entries from different products separate", () => {
  const preview = buildPreview([
    entry({ productId: "p1", variantId: "v1", productTitle: "Shirt", newTitle: "Shirt (Reissue)" }),
    entry({ productId: "p2", variantId: "v2", productTitle: "Hat", newTitle: "Hat (Reissue)" }),
  ]);
  assert.equal(preview.titleChanges.length, 2);
});
