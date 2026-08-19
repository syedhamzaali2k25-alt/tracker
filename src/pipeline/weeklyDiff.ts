import type { MarginRow } from "../types.js";

export interface MarginChange {
  row: MarginRow;
  /** null means the variant wasn't present in the previous run (new product, or first run ever). */
  previousFlag: MarginRow["flag"] | null;
}

export interface WeeklyDiffResult {
  newlyBelowCost: MarginChange[];
  newlyLowMargin: MarginChange[];
}

/**
 * Compares this run's rows against the previous run's, keyed by variantId,
 * and returns only the variants that just crossed INTO below-cost or
 * low-margin — not everything currently in that state. A variant missing
 * from `previousRows` (new product, or the very first run for this shop)
 * counts as "previously ok": debuting already below cost or thin-margin is
 * still worth flagging, not silently skipped.
 */
export function diffMarginRows(
  previousRows: MarginRow[] | undefined,
  currentRows: MarginRow[],
): WeeklyDiffResult {
  const previousByVariant = new Map((previousRows ?? []).map((row) => [row.variantId, row]));

  const newlyBelowCost: MarginChange[] = [];
  const newlyLowMargin: MarginChange[] = [];

  for (const row of currentRows) {
    const previousFlag = previousByVariant.get(row.variantId)?.flag ?? null;

    if (row.flag === "below-cost" && previousFlag !== "below-cost") {
      newlyBelowCost.push({ row, previousFlag });
    } else if (row.flag === "low-margin" && previousFlag !== "low-margin") {
      newlyLowMargin.push({ row, previousFlag });
    }
  }

  return { newlyBelowCost, newlyLowMargin };
}

export function hasChanges(diff: WeeklyDiffResult): boolean {
  return diff.newlyBelowCost.length > 0 || diff.newlyLowMargin.length > 0;
}
