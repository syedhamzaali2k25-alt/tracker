import { changedEntries, readFixEntries, type FixEntry } from "../sheets/fixSheet.js";

export interface ChangePreview {
  entries: FixEntry[];
  count: number;
  biggestIncreasePct: number;
  biggestDecreasePct: number;
  belowCostAfterChange: FixEntry[];
  zeroPriceAfterChange: FixEntry[];
}

export function buildPreview(entries: FixEntry[]): ChangePreview {
  let biggestIncreasePct = 0;
  let biggestDecreasePct = 0;
  const belowCostAfterChange: FixEntry[] = [];
  const zeroPriceAfterChange: FixEntry[] = [];

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
  }

  return {
    entries,
    count: entries.length,
    biggestIncreasePct,
    biggestDecreasePct,
    belowCostAfterChange,
    zeroPriceAfterChange,
  };
}

export function printPreview(preview: ChangePreview): void {
  console.log(`You are about to change ${preview.count} prices/costs.`);
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
  if (preview.count === 0) {
    console.log("No New Price / New Cost values found in the Fix tab — nothing to change.");
  }
}

export async function buildPreviewFromSheet(
  onProgress?: (message: string) => void,
): Promise<ChangePreview> {
  const report = onProgress ?? (() => {});
  report("Reading the Fix tab...");
  const entries = await readFixEntries();
  const changed = changedEntries(entries);
  return buildPreview(changed);
}

async function main() {
  const preview = await buildPreviewFromSheet((message) => console.log(message));
  printPreview(preview);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
