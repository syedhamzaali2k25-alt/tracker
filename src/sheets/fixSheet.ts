import { FIX_TAB } from "./diagnosticSheet.js";
import { readRange } from "./client.js";

export interface FixEntry {
  productTitle: string;
  variantTitle: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  currentPrice: number;
  currentCost: number | null;
  newPrice: number | null;
  newCost: number | null;
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

const VALID_VARIANT_ID_PREFIX = "gid://shopify/ProductVariant/";

export function isValidVariantId(id: string): boolean {
  return id.startsWith(VALID_VARIANT_ID_PREFIX);
}

export interface ParsedFixRow {
  entry: FixEntry | null;
  /** Set when the row was skipped instead of parsed. */
  warning: string | null;
}

/**
 * Rows can drift from their intended variant if a merchant inserts or
 * deletes rows in the sheet — the ID columns are the only thing tying a row
 * back to a real Shopify variant, so a malformed variantId means we can no
 * longer trust which variant this row is even about. Skip it rather than
 * risk applying an edit to the wrong product.
 */
export function parseFixRow(row: string[]): ParsedFixRow {
  const productTitle = row[0] ?? "";
  const variantId = row[8] ?? "";

  if (!isValidVariantId(variantId)) {
    return {
      entry: null,
      warning:
        `Skipping "${productTitle || "(unnamed row)"}" — its Shopify Variant ID looks wrong ` +
        `("${variantId || "blank"}"). This can happen if rows were inserted or deleted in the ` +
        "Fix tab. Re-run the diagnostic to refresh the IDs.",
    };
  }

  return {
    entry: {
      productTitle,
      variantTitle: row[1] ?? "",
      currentPrice: Number(row[3]),
      currentCost: parseNumber(row[4]),
      newPrice: parseNumber(row[5]),
      newCost: parseNumber(row[6]),
      productId: row[7] ?? "",
      variantId,
      inventoryItemId: row[9] ?? "",
    },
    warning: null,
  };
}

export async function readFixEntries(): Promise<FixEntry[]> {
  const values = await readRange(`${FIX_TAB}!A2:J`);
  const entries: FixEntry[] = [];

  for (const row of values) {
    if (row.length === 0 || row[0] === "") continue;

    const { entry, warning } = parseFixRow(row);
    if (warning) {
      console.warn(`Warning: ${warning}`);
      continue;
    }
    entries.push(entry!);
  }

  return entries;
}

export function changedEntries(entries: FixEntry[]): FixEntry[] {
  return entries.filter(
    (e) =>
      (e.newPrice !== null && e.newPrice !== e.currentPrice) ||
      (e.newCost !== null && e.newCost !== e.currentCost),
  );
}

export interface PendingEdit {
  newPrice: number | null;
  newCost: number | null;
}

export function buildPendingEditsMap(entries: FixEntry[]): Map<string, PendingEdit> {
  const map = new Map<string, PendingEdit>();
  for (const entry of entries) {
    if (entry.newPrice !== null || entry.newCost !== null) {
      map.set(entry.variantId, { newPrice: entry.newPrice, newCost: entry.newCost });
    }
  }
  return map;
}
