import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// dotenv/config's default behavior loads .env from process.cwd(), which is
// wrong when this module is imported from the app/ project (cwd is app/,
// not the repo root). Resolve the root .env relative to this file instead,
// so it's found regardless of which project imports config.ts.
const repoRootEnvPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
dotenv.config({ path: repoRootEnvPath });

export const config = {
  shopify: {
    // No shop/accessToken here by design — those come from per-shop OAuth
    // sessions now (see src/shopify/client.ts's ShopContext), never from a
    // single global. apiVersion isn't secret or shop-specific, so it stays.
    get apiVersion() {
      return process.env.SHOPIFY_API_VERSION ?? "2026-07";
    },
  },
  // No Google config here by design — Sheets access is now per-merchant
  // OAuth (see src/sheets/googleAuth.ts's GoogleOAuthConfig / GoogleContext),
  // stored per shop, never a single global service account or sheet ID.
  get lookbackDays() {
    return Number(process.env.LOOKBACK_DAYS ?? 30);
  },
  get lowMarginThreshold() {
    return Number(process.env.LOW_MARGIN_THRESHOLD ?? 0.2);
  },
};
