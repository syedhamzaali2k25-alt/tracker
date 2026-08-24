import type { ShopContext } from "~lib/shopify/client.js";

/** authenticate.admin() always returns an active session with a token; the check is defensive. */
export function toShopContext(session: { shop: string; accessToken?: string }): ShopContext {
  if (!session.accessToken) {
    throw new Error("No access token on the current session. Try reinstalling the app.");
  }
  return { shop: session.shop, accessToken: session.accessToken };
}
