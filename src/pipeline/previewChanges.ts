import type { GoogleContext } from "../sheets/client.js";
import { changedEntries, readFixEntries, type FixEntry } from "../sheets/fixSheet.js";

/** A product-level rename — deduped so a multi-variant product with several rows in the Fix tab only appears once. */
export interface TitleChange {
  productId: string;
  oldTitle: string;
  newTitle: string;
}

export interface ChangePreview {
  entries: FixEntry[];
  count: number;
  biggestIncreasePct: number;
  biggestDecreasePct: number;
  belowCostAfterChange: FixEntry[];
  zeroPriceAfterChange: FixEntry[];
  titleChanges: TitleChange[];
}

export function buildPreview(entries: FixEntry[]): ChangePreview {
  let biggestIncreasePct = 0;
  let biggestDecreasePct = 0;
  const belowCostAfterChange: FixEntry[] = [];
  const zeroPriceAfterChange: FixEntry[] = [];
  const titleChanges: TitleChange[] = [];
  const seenTitleProductIds = new Set<string>();

  for (const entry of entries) {
    const effectivePrice = entry.newPrice ?? entry.currentPrice;
    const effectiveCost = entry.newCost ?? entry.currentCost;

    if (entry.newPrice !== null && entry.currentPrice > 0) {
      const changePct = ((entry.newPrice - entry.currentPrice) / entry.currentPrice) * 100;
      if (changePct > biggestIncreasePct) biggestIncreasePct = changePct;
      if (changePct < biggestDecreasePct) biggestDecreasePct = changePct;
    }

    if (effectiveCost !== null && effectivePrice < effectiveCost) {
      belowCostAfterChange.push(entry);
    }
    if (effectivePrice === 0) {
      zeroPriceAfterChange.push(entry);
    }

    // A title applies to the whole product, not this one variant, so a
    // product with multiple rows in the Fix tab (one per variant) only
    // contributes its first title change here rather than once per row.
    if (
      entry.newTitle !== null &&
      entry.newTitle !== entry.productTitle &&
      !seenTitleProductIds.has(entry.productId)
    ) {
      seenTitleProductIds.add(entry.productId);
      titleChanges.push({
        productId: entry.productId,
        oldTitle: entry.productTitle,
        newTitle: entry.newTitle,
      });
    }
  }

  return {
    entries,
    count: entries.length,
    biggestIncreasePct,
    biggestDecreasePct,
    belowCostAfterChange,
    zeroPriceAfterChange,
    titleChanges,
  };
}

export function printPreview(preview: ChangePreview): void {
  console.log(`You are about to change ${preview.count} prices/costs/titles.`);
  console.log(`Biggest increase: +${preview.biggestIncreasePct.toFixed(1)}%`);
  console.log(`Biggest decrease: ${preview.biggestDecreasePct.toFixed(1)}%`);
  if (preview.belowCostAfterChange.length > 0) {
    console.log(
      `⚠️  ${preview.belowCostAfterChange.length} product(s) would end up BELOW their cost:`,
    );
    for (const entry of preview.belowCostAfterChange) {
      console.log(`   - ${entry.productTitle} ${entry.variantTitle}`.trimEnd());
    }
  }
  if (preview.zeroPriceAfterChange.length > 0) {
    console.log(`⚠️  ${preview.zeroPriceAfterChange.length} product(s) would become 0:`);
    for (const entry of preview.zeroPriceAfterChange) {
      console.log(`   - ${entry.productTitle} ${entry.variantTitle}`.trimEnd());
    }
  }
  if (preview.titleChanges.length > 0) {
    console.log(`${preview.titleChanges.length} title(s) would change:`);
    for (const change of preview.titleChanges) {
      console.log(`   - "${change.oldTitle}" -> "${change.newTitle}"`);
    }
  }
  if (preview.count === 0) {
    console.log("No New Price / New Cost / New Title values found in the Fix tab. Nothing to change.");
  }
}

export async function buildPreviewFromSheet(
  ctx: GoogleContext,
  onProgress?: (message: string) => void,
): Promise<ChangePreview> {
  const report = onProgress ?? (() => {});
  report("Reading the Fix tab...");
  const entries = await readFixEntries(ctx);
  const changed = changedEntries(entries);
  return buildPreview(changed);
}
