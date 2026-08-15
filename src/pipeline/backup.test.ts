import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadLatestBackup, markBackupApplied, saveBackup, type BackupEntry } from "./backup.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "margin-tracker-backups-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const entry: BackupEntry = {
  productId: "p1",
  variantId: "v1",
  inventoryItemId: "i1",
  productTitle: "Test Product",
  variantTitle: "Default",
  price: 1000,
  cost: 500,
};

test("saveBackup then loadLatestBackup returns the same entries", async () => {
  await withTempDir(async (dir) => {
    await saveBackup([entry], dir);
    const loaded = await loadLatestBackup(dir);

    assert.ok(loaded);
    assert.deepEqual(loaded.entries, [entry]);
  });
});

test("loadLatestBackup returns null once the only backup has been marked applied", async () => {
  await withTempDir(async (dir) => {
    const filePath = await saveBackup([entry], dir);
    await markBackupApplied(filePath);

    const loaded = await loadLatestBackup(dir);
    assert.equal(loaded, null);
  });
});

test("undo twice in a row does not re-apply the same snapshot", async () => {
  await withTempDir(async (dir) => {
    const filePath = await saveBackup([entry], dir);

    const firstUndo = await loadLatestBackup(dir);
    assert.ok(firstUndo);
    await markBackupApplied(firstUndo.path);

    const secondUndo = await loadLatestBackup(dir);
    assert.equal(secondUndo, null, "a second undo should find nothing left to restore");
    assert.equal(firstUndo.path, filePath);
  });
});

test("an older backup is still found after a newer one is marked applied", async () => {
  await withTempDir(async (dir) => {
    const olderPath = await saveBackup([entry], dir);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newerPath = await saveBackup([{ ...entry, price: 1200 }], dir);

    await markBackupApplied(newerPath);

    const loaded = await loadLatestBackup(dir);
    assert.ok(loaded);
    assert.equal(loaded.path, olderPath);
  });
});
