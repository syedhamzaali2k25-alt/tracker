import type { DiagnosticSummary, MarginRow } from "~lib/types.js";
import db from "./db.server";

interface CachedDiagnostic {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

/**
 * Per-shop cache of the last diagnostic result, so "Create sheet" can reuse
 * it instead of re-fetching from Shopify or round-tripping the whole row set
 * through the browser as a form field. Not sensitive data (product titles,
 * prices, costs — nothing that needs the encryption sessions get), so a
 * plain Prisma model is enough; no need for the encrypted-session-storage
 * treatment here.
 */
export async function setCachedDiagnostic(
  shop: string,
  result: CachedDiagnostic,
): Promise<void> {
  const data = JSON.stringify(result);
  await db.diagnosticCache.upsert({
    where: { shop },
    create: { shop, data },
    update: { data },
  });
}

export async function getCachedDiagnostic(
  shop: string,
): Promise<CachedDiagnostic | undefined> {
  const row = await db.diagnosticCache.findUnique({ where: { shop } });
  return row ? (JSON.parse(row.data) as CachedDiagnostic) : undefined;
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deleteCachedDiagnostic(shop: string): Promise<void> {
  await db.diagnosticCache.deleteMany({ where: { shop } });
}
