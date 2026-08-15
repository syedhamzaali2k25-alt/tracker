import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFixRows } from "./diagnosticSheet.js";
import { buildPendingEditsMap, type FixEntry } from "./fixSheet.js";
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

function fixEntry(overrides: Partial<FixEntry>): FixEntry {
  return {
    productTitle: "Test Product",
    variantTitle: "Default",
    productId: "p1",
    variantId: "v1",
    inventoryItemId: "i1",
    currentPrice: 1000,
    currentCost: 500,
    newPrice: null,
    newCost: null,
    ...overrides,
  };
}

test("preserves a pending New Price for a variant that still exists", () => {
  const rows = [marginRow({ variantId: "v1" })];
  const pendingEdits = buildPendingEditsMap([fixEntry({ variantId: "v1", newPrice: 1200 })]);

  const { values, preservedCount } = buildFixRows(rows, pendingEdits);

  assert.equal(preservedCount, 1);
  assert.equal(values[0][5], 1200); // New Price column
});

test("drops a pending edit for a variant that no longer exists in Shopify", () => {
  const rows = [marginRow({ variantId: "v1" })]; // v1 is the only variant Shopify still has
  const pendingEdits = buildPendingEditsMap([
    fixEntry({ variantId: "v2", newPrice: 999 }), // v2 was deleted from Shopify
  ]);

  const { values, preservedCount } = buildFixRows(rows, pendingEdits);

  assert.equal(preservedCount, 0);
  assert.equal(values.length, 1);
  assert.equal(values[0][5], ""); // New Price stays blank for v1, v2's edit is gone
});

test("a clean run with no pending edits leaves New Price/New Cost blank", () => {
  const rows = [marginRow({ variantId: "v1" }), marginRow({ variantId: "v2", sku: "SKU-2" })];
  const pendingEdits = buildPendingEditsMap([]); // Fix tab was empty

  const { values, preservedCount } = buildFixRows(rows, pendingEdits);

  assert.equal(preservedCount, 0);
  for (const row of values) {
    assert.equal(row[5], "");
    assert.equal(row[6], "");
  }
});

test("preserves New Cost independently of New Price", () => {
  const rows = [marginRow({ variantId: "v1" })];
  const pendingEdits = buildPendingEditsMap([fixEntry({ variantId: "v1", newCost: 600 })]);

  const { values, preservedCount } = buildFixRows(rows, pendingEdits);

  assert.equal(preservedCount, 1);
  assert.equal(values[0][5], ""); // New Price still blank
  assert.equal(values[0][6], 600); // New Cost preserved
});
