// Plain constants, deliberately not a .server.ts file: components render
// these directly (plan name, price, trial length), so they need to be safe
// for the client bundle. shopify.server.ts imports these for its billing
// config instead of declaring its own copies.
export const SUBSCRIPTION_PLAN = "Margin Tracker";
export const SUBSCRIPTION_PRICE = 15;
export const SUBSCRIPTION_PLAN_TEAM = "Margin Tracker Team";
export const SUBSCRIPTION_PRICE_TEAM = 30;
export const SUBSCRIPTION_TRIAL_DAYS = 14;

export type PlanTier = "standard" | "team";

export interface PlanInfo {
  tier: PlanTier;
  name: string;
  price: number;
}

/** Keyed by tier so billing config and plan-picker UI can iterate both plans instead of repeating each literal twice. */
export const PLANS: Record<PlanTier, PlanInfo> = {
  standard: { tier: "standard", name: SUBSCRIPTION_PLAN, price: SUBSCRIPTION_PRICE },
  team: { tier: "team", name: SUBSCRIPTION_PLAN_TEAM, price: SUBSCRIPTION_PRICE_TEAM },
};

/**
 * Maps a Shopify plan name (from billing.request()/billing.check()'s
 * AppSubscription.name) to our tier. Anything unrecognized — including no
 * name at all — resolves to "standard", never a silent Team unlock.
 */
export function planTierFromName(name: string | null | undefined): PlanTier {
  return name === SUBSCRIPTION_PLAN_TEAM ? "team" : "standard";
}

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
export function billingStartUrl(shop: string, host: string | null, tier: PlanTier = "standard"): string {
  const params = new URLSearchParams({ shop, plan: tier });
  if (host) params.set("host", host);
  return `/app/billing/start?${params.toString()}`;
}
