import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_BACKUPS_DIR = path.resolve(process.cwd(), "backups");

export interface BackupEntry {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  productTitle: string;
  variantTitle: string;
  price: number;
  cost: number | null;
}

export async function saveBackup(
  entries: BackupEntry[],
  dir: string = DEFAULT_BACKUPS_DIR,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(entries, null, 2), "utf8");
  return filePath;
}

export async function loadLatestBackup(
  dir: string = DEFAULT_BACKUPS_DIR,
): Promise<{ path: string; entries: BackupEntry[] } | null> {
  await mkdir(dir, { recursive: true });
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".json") && !f.endsWith(".applied.json"))
    .sort();
  const latest = files.at(-1);
  if (!latest) return null;

  const filePath = path.join(dir, latest);
  const entries = JSON.parse(await readFile(filePath, "utf8")) as BackupEntry[];
  return { path: filePath, entries };
}

export async function markBackupApplied(filePath: string): Promise<string> {
  const newPath = filePath.replace(/\.json$/, ".applied.json");
  await rename(filePath, newPath);
  return newPath;
}
