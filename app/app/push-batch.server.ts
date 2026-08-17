import type { PushBatchEntry } from "~lib/types.js";
import type { PushBatchRecorder } from "~lib/pipeline/applyChanges.js";
import db from "./db.server";

export interface PushBatchSummary {
  id: string;
  createdAt: string;
  changeCount: number;
  reverted: boolean;
}

export interface PushBatchDetail extends PushBatchSummary {
  entries: PushBatchEntry[];
}

/**
 * Implements applyChanges()'s PushBatchRecorder against Prisma, so the
 * shared pipeline code in src/ can save a batch without knowing anything
 * about the database. Wired in from app._index.tsx's "apply" action.
 */
export const prismaPushBatchRecorder: PushBatchRecorder = {
  async recordBatch(shop, entries) {
    const batch = await db.pushBatch.create({
      data: { shop, changeCount: entries.length, entries: JSON.stringify(entries) },
    });
    return batch.id;
  },
};

/** Newest first, for the History page's list. */
export async function listPushBatches(shop: string): Promise<PushBatchSummary[]> {
  const rows = await db.pushBatch.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, changeCount: true, reverted: true },
  });
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

/**
 * Looks up a batch by ID, scoped to the requesting shop — returns null both
 * when the ID doesn't exist and when it belongs to a different shop, so a
 * guessed/borrowed ID can't be used to undo another merchant's push.
 */
export async function getPushBatch(shop: string, id: string): Promise<PushBatchDetail | null> {
  const row = await db.pushBatch.findUnique({ where: { id } });
  if (!row || row.shop !== shop) return null;

  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    changeCount: row.changeCount,
    reverted: row.reverted,
    entries: JSON.parse(row.entries) as PushBatchEntry[],
  };
}

export async function markPushBatchReverted(id: string): Promise<void> {
  await db.pushBatch.update({ where: { id }, data: { reverted: true } });
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deletePushBatches(shop: string): Promise<void> {
  await db.pushBatch.deleteMany({ where: { shop } });
}
