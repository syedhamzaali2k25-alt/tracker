import type { BackupEntry } from "~lib/types.js";
import db from "./db.server";

export interface PushBatchSummary {
  id: string;
  createdAt: string;
  changeCount: number;
  reverted: boolean;
}

export interface PushBatchDetail extends PushBatchSummary {
  entries: BackupEntry[];
}

/** Called by applyChanges() before it touches Shopify. Returns the new batch's ID. */
export async function saveBatch(shop: string, entries: BackupEntry[]): Promise<string> {
  const batch = await db.pushBatch.create({
    data: {
      shop,
      changeCount: entries.length,
      entries: JSON.stringify(entries),
    },
  });
  return batch.id;
}

export async function listBatches(shop: string): Promise<PushBatchSummary[]> {
  const rows = await db.pushBatch.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    changeCount: row.changeCount,
    reverted: row.reverted,
  }));
}

/**
 * Scopes the lookup to `shop` so one store can never undo another store's
 * batch by guessing/reusing an ID — returns null rather than someone else's
 * row if it doesn't match.
 */
export async function getBatch(shop: string, id: string): Promise<PushBatchDetail | null> {
  const row = await db.pushBatch.findUnique({ where: { id } });
  if (!row || row.shop !== shop) return null;
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    changeCount: row.changeCount,
    reverted: row.reverted,
    entries: JSON.parse(row.entries) as BackupEntry[],
  };
}

/** Marks a batch as undone so its Undo button can't be used twice. */
export async function markBatchReverted(id: string): Promise<void> {
  await db.pushBatch.update({ where: { id }, data: { reverted: true, revertedAt: new Date() } });
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deletePushBatches(shop: string): Promise<void> {
  await db.pushBatch.deleteMany({ where: { shop } });
}

/**
 * Plan-tier-aware History/Undo retention: standard plans keep 3 months of
 * push batches, Team plans keep 12 (see app/cron/weeklyCheck.server.ts,
 * the only scheduled execution context in this app, which calls this once
 * per shop per run). A reverted batch is deleted the same as any other once
 * it ages out — reverting only marks it undone, it doesn't extend how long
 * the record is kept.
 */
export async function deleteExpiredPushBatches(shop: string, retentionMonths: number): Promise<void> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);
  await db.pushBatch.deleteMany({ where: { shop, createdAt: { lt: cutoff } } });
}
