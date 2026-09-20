import assert from "node:assert/strict";
import { test } from "node:test";
import {
  changedEntries,
  isValidVariantId,
  parseFixRow,
  parseNumber,
  parseTitle,
  type FixEntry,
} from "./fixSheet.js";

function row(overrides: Partial<{
  productTitle: string;
  variantTitle: string;
  currentPrice: string;
  currentCost: string;
  newPrice: string;
  newCost: string;
  newTitle: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
}> = {}): string[] {
  const defaults = {
    productTitle: "Blue Shirt",
    variantTitle: "M",
    currentPrice: "1150",
    currentCost: "1000",
    newPrice: "",
    newCost: "",
    newTitle: "",
    productId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    inventoryItemId: "gid://shopify/InventoryItem/1",
  };
  const merged = { ...defaults, ...overrides };
  return [
    merged.productTitle,
    merged.variantTitle,
    "",
    merged.currentPrice,
    merged.currentCost,
    merged.newPrice,
    merged.newCost,
    merged.newTitle,
    merged.productId,
    merged.variantId,
    merged.inventoryItemId,
  ];
}

test("isValidVariantId accepts a real Shopify variant gid", () => {
  assert.equal(isValidVariantId("gid://shopify/ProductVariant/40123456"), true);
});

test("isValidVariantId rejects a blank, a plain number, and a different resource's gid", () => {
  assert.equal(isValidVariantId(""), false);
  assert.equal(isValidVariantId("40123456"), false);
  assert.equal(isValidVariantId("gid://shopify/Product/40123456"), false);
});

test("parseFixRow returns an entry for a row with a valid variant ID", () => {
  const { entry, warning } = parseFixRow(row());

  assert.equal(warning, null);
  assert.ok(entry);
  assert.equal(entry.variantId, "gid://shopify/ProductVariant/1");
  assert.equal(entry.productTitle, "Blue Shirt");
});

test("parseFixRow skips a row with a malformed variant ID and names the product in the warning", () => {
  const { entry, warning } = parseFixRow(row({ variantId: "1234", productTitle: "Black Jeans" }));

  assert.equal(entry, null);
  assert.ok(warning);
  assert.match(warning, /Black Jeans/);
});

test("parseFixRow skips a row with a blank variant ID (shifted/deleted row)", () => {
  const { entry, warning } = parseFixRow(row({ variantId: "", productTitle: "Grey Hoodie" }));

  assert.equal(entry, null);
  assert.match(warning!, /Grey Hoodie/);
});

test("parseNumber handles comma thousands separators", () => {
  assert.equal(parseNumber("1,150"), 1150);
});

test("parseNumber strips a currency prefix", () => {
  assert.equal(parseNumber("PKR 1150"), 1150);
});

test("parseNumber trims stray whitespace", () => {
  assert.equal(parseNumber(" 1150 "), 1150);
});

test("parseNumber treats an empty cell as null, not 0", () => {
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber(undefined), null);
});

test("parseNumber rejects garbage instead of treating it as 0", () => {
  assert.equal(parseNumber("abc"), null);
});

test("parseFixRow skips a row whose Current Price isn't a valid number", () => {
  const { entry, warning } = parseFixRow(row({ currentPrice: "abc", productTitle: "Red Cap" }));

  assert.equal(entry, null);
  assert.match(warning!, /Red Cap/);
  assert.match(warning!, /Current Price/);
});

test("parseFixRow accepts a formatted Current Price", () => {
  const { entry, warning } = parseFixRow(row({ currentPrice: "PKR 1,150" }));

  assert.equal(warning, null);
  assert.equal(entry!.currentPrice, 1150);
});

test("parseNumber resolves US-style (comma thousands, dot decimal) and European-style (dot thousands, comma decimal) to the same value", () => {
  assert.equal(parseNumber("1,150.50"), 1150.5);
  assert.equal(parseNumber("1.150,50"), 1150.5);
  assert.equal(parseNumber("1,150.50"), parseNumber("1.150,50"));
});

test("parseNumber handles multiple thousands groups regardless of which symbol groups them", () => {
  assert.equal(parseNumber("1,150,000.50"), 1150000.5);
  assert.equal(parseNumber("1.150.000,50"), 1150000.5);
});

test("parseNumber treats accounting-style parentheses as negative", () => {
  assert.equal(parseNumber("(500)"), -500);
  assert.equal(parseNumber("(1,150.50)"), -1150.5);
});

test("parseNumber does not confuse a lone thousands comma with a decimal comma", () => {
  // No dot present, so the comma stays a thousands separator, matching the
  // existing "1,150" -> 1150 behavior rather than being reinterpreted as 1.15.
  assert.equal(parseNumber("1,150"), 1150);
});

test("parseTitle treats a blank cell as null, not an empty-string title", () => {
  assert.equal(parseTitle(""), null);
  assert.equal(parseTitle(undefined), null);
});

test("parseTitle trims stray whitespace and treats whitespace-only as blank", () => {
  assert.equal(parseTitle("  New Name  "), "New Name");
  assert.equal(parseTitle("   "), null);
});

test("parseTitle passes through an ordinary title unchanged", () => {
  assert.equal(parseTitle("Blue Shirt (Reissue)"), "Blue Shirt (Reissue)");
});

test("parseFixRow parses a New Title cell into newTitle", () => {
  const { entry, warning } = parseFixRow(row({ newTitle: "Blue Shirt (Reissue)" }));

  assert.equal(warning, null);
  assert.equal(entry!.newTitle, "Blue Shirt (Reissue)");
});

test("parseFixRow leaves newTitle null when the New Title cell is blank", () => {
  const { entry } = parseFixRow(row());
  assert.equal(entry!.newTitle, null);
});

test("parseFixRow still reads the ID columns correctly now that New Title sits before them", () => {
  const { entry } = parseFixRow(
    row({
      newTitle: "Renamed",
      productId: "gid://shopify/Product/99",
      variantId: "gid://shopify/ProductVariant/99",
      inventoryItemId: "gid://shopify/InventoryItem/99",
    }),
  );

  assert.equal(entry!.productId, "gid://shopify/Product/99");
  assert.equal(entry!.variantId, "gid://shopify/ProductVariant/99");
  assert.equal(entry!.inventoryItemId, "gid://shopify/InventoryItem/99");
});

function fixEntry(overrides: Partial<FixEntry> = {}): FixEntry {
  return {
    productTitle: "Blue Shirt",
    variantTitle: "M",
    productId: "gid://shopify/Product/1",
    variantId: "gid://shopify/ProductVariant/1",
    inventoryItemId: "gid://shopify/InventoryItem/1",
    currentPrice: 1150,
    currentCost: 1000,
    newPrice: null,
    newCost: null,
    newTitle: null,
    ...overrides,
  };
}

test("changedEntries includes a row whose only change is a new title", () => {
  const changed = changedEntries([fixEntry({ newTitle: "Blue Shirt (Reissue)" })]);
  assert.equal(changed.length, 1);
});

test("changedEntries drops a row whose New Title matches the current title", () => {
  const changed = changedEntries([fixEntry({ productTitle: "Blue Shirt", newTitle: "Blue Shirt" })]);
  assert.equal(changed.length, 0);
});

test("changedEntries still includes price/cost-only changes when title is untouched", () => {
  const changed = changedEntries([fixEntry({ newPrice: 1200 })]);
  assert.equal(changed.length, 1);
});
