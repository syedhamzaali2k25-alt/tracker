// Plain constants, deliberately not a .server.ts file: components render
// these directly (plan name, price, trial length), so they need to be safe
// for the client bundle. shopify.server.ts imports these for its billing
// config instead of declaring its own copies.
export const SUBSCRIPTION_PLAN = "Margin Tracker";
export const SUBSCRIPTION_PRICE = 15;
export const SUBSCRIPTION_TRIAL_DAYS = 14;

/**
 * The href for the "Start free trial"/"Resubscribe" button. It must carry
 * `shop` (and `host`, when the current page has one) explicitly, because
 * this link is a plain top-level navigation — not a fetcher submission —
 * and authenticate.admin() can't fall back to a session-token header on a
 * request like that. Without these params it can't identify the shop
 * either, and instead renders an App Bridge bounce page that (in this
 * setup) never resolves before Shopify's confirmation-page redirect times
 * out — the exact 401 this was written to fix. See
 * app/routes/app.billing.start.tsx for the other half of this: `target="_top"`
 * on every place this URL is used as an href.
 */
export function billingStartUrl(shop: string, host: string | null): string {
  const params = new URLSearchParams({ shop });
  if (host) params.set("host", host);
  return `/app/billing/start?${params.toString()}`;
}
