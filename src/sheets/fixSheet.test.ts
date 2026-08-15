import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidVariantId, parseFixRow, parseNumber } from "./fixSheet.js";

function row(overrides: Partial<{
  productTitle: string;
  variantTitle: string;
  currentPrice: string;
  currentCost: string;
  newPrice: string;
  newCost: string;
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
