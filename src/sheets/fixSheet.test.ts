import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidVariantId, parseFixRow } from "./fixSheet.js";

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
