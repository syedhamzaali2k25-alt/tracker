import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const BACKUPS_DIR = path.resolve(process.cwd(), "backups");

export interface BackupEntry {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  price: number;
  cost: number | null;
}

export async function saveBackup(entries: BackupEntry[]): Promise<string> {
  await mkdir(BACKUPS_DIR, { recursive: true });
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  await writeFile(filePath, JSON.stringify(entries, null, 2), "utf8");
  return filePath;
}

export async function loadLatestBackup(): Promise<{ path: string; entries: BackupEntry[] } | null> {
  await mkdir(BACKUPS_DIR, { recursive: true });
  const files = (await readdir(BACKUPS_DIR)).filter((f) => f.endsWith(".json")).sort();
  const latest = files.at(-1);
  if (!latest) return null;

  const filePath = path.join(BACKUPS_DIR, latest);
  const entries = JSON.parse(await readFile(filePath, "utf8")) as BackupEntry[];
  return { path: filePath, entries };
}
