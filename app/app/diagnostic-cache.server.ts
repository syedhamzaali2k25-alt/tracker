import type { DiagnosticSummary, MarginRow } from "~lib/types.js";

interface CachedDiagnostic {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

/**
 * In-memory, per-shop cache of the last diagnostic result, so "Create sheet"
 * can reuse it instead of re-fetching from Shopify or round-tripping the
 * whole row set through the browser as a form field. Deliberately not a
 * database — this is single-process, lost on restart, and not shared across
 * server instances. Fine for now (single static-token shop, per Phase 1);
 * revisit once Phase 2 adds a real per-shop data store.
 */
const cache = new Map<string, CachedDiagnostic>();

export function setCachedDiagnostic(shop: string, result: CachedDiagnostic): void {
  cache.set(shop, result);
}

export function getCachedDiagnostic(shop: string): CachedDiagnostic | undefined {
  return cache.get(shop);
}
