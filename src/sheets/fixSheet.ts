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

export async function readFixEntries(): Promise<FixEntry[]> {
  const values = await readRange(`${FIX_TAB}!A2:J`);

  return values
    .filter((row) => row.length > 0 && row[0] !== "")
    .map((row) => ({
      productTitle: row[0] ?? "",
      variantTitle: row[1] ?? "",
      currentPrice: Number(row[3]),
      currentCost: parseNumber(row[4]),
      newPrice: parseNumber(row[5]),
      newCost: parseNumber(row[6]),
      productId: row[7] ?? "",
      variantId: row[8] ?? "",
      inventoryItemId: row[9] ?? "",
    }));
}

export function changedEntries(entries: FixEntry[]): FixEntry[] {
  return entries.filter(
    (e) =>
      (e.newPrice !== null && e.newPrice !== e.currentPrice) ||
      (e.newCost !== null && e.newCost !== e.currentCost),
  );
}
