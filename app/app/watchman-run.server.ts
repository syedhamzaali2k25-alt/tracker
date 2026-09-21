import type { DiagnosticSummary, MarginRow } from "~lib/types.js";
import db from "./db.server";

export interface WatchmanRunResult {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

/** The weekly job's own last-run snapshot for this shop, or undefined on the first-ever run. */
export async function getLastWatchmanRun(shop: string): Promise<WatchmanRunResult | undefined> {
  const row = await db.watchmanRun.findUnique({ where: { shop } });
  return row ? (JSON.parse(row.data) as WatchmanRunResult) : undefined;
}

/**
 * Just the timestamp, without parsing the (potentially large) rows/summary
 * JSON blob — used by the cron entry point to decide whether a shop is due
 * for its next check yet, before doing any Shopify API work for it.
 */
export async function getLastWatchmanRunAt(shop: string): Promise<Date | null> {
  const row = await db.watchmanRun.findUnique({ where: { shop }, select: { ranAt: true } });
  return row?.ranAt ?? null;
}

export async function saveWatchmanRun(shop: string, result: WatchmanRunResult): Promise<void> {
  const data = JSON.stringify(result);
  await db.watchmanRun.upsert({
    where: { shop },
    create: { shop, data },
    update: { data },
  });
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deleteWatchmanRun(shop: string): Promise<void> {
  await db.watchmanRun.deleteMany({ where: { shop } });
}
