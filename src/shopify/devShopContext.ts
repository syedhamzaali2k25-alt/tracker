import type { ShopContext } from "./client.js";

/**
 * The app itself never uses this — it authenticates each request through
 * per-shop OAuth (see app/app/shopify.server.ts) and builds a ShopContext
 * from the session's offline access token.
 *
 * The CLI scripts (npm run diagnostic/preview/apply/undo) have no OAuth
 * session to read, though, and still need *some* store to talk to for local
 * testing against a real dev store. This reads a static token straight from
 * the environment as a dev-only fallback — intentionally not part of
 * config.ts, and intentionally not documented in .env.example, so it can't
 * be mistaken for how the deployed app authenticates.
 */
export function getDevShopContext(): ShopContext {
  const shop = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shop || !accessToken) {
    throw new Error(
      "SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN must be set in your environment to run this " +
        "script directly. The app itself no longer uses these — it authenticates per shop " +
        "via OAuth — but the CLI scripts still need a store to test against locally. Create " +
        "a custom app in your dev store's admin (Settings > Apps and sales channels > " +
        "Develop apps), grant it read_products/read_orders/read_inventory/write_products/" +
        "write_inventory, install it, and set both variables in your .env.",
    );
  }

  return { shop, accessToken };
}
