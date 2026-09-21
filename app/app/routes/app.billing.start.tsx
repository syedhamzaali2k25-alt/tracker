import type { LoaderFunctionArgs } from "react-router";
import { authenticate, BILLING_IS_TEST } from "../shopify.server";
import { SUBSCRIPTION_PLAN, SUBSCRIPTION_PLAN_TEAM, type PlanTier } from "../billing-plan";

/**
 * Carries `host` through to the callback, not just `shop`. Without it,
 * app.billing.callback.tsx's own redirect back into `/app` has only `shop`
 * to go on, and authenticate.admin() then has to fall back to rendering a
 * bare App Bridge bootstrap page and trusting its client-side JS to work
 * out where to redirect — an extra, harder-to-verify hop. Passing `host`
 * the whole way through means every hop in the return trip is a plain
 * server-side redirect with everything authenticate.admin() needs already
 * on the URL, the same as a normal embedded page load.
 */
function billingReturnUrl(shop: string, host: string | null): string {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  const params = new URLSearchParams({ shop });
  if (host) params.set("host", host);
  return `${appUrl}/app/billing/callback?${params.toString()}`;
}

/**
 * Reached by simply navigating here (a plain <s-button href="/app/billing/start">
 * from the upgrade prompt), the same way Shopify's own billing.request()
 * examples call it straight from a route's loader — not a fetcher
 * submission. billing.request() always throws: a same-origin redirect into
 * Shopify's own "exit iframe" bounce page when this request is embedded, or
 * a 401 with a reauthorize-URL header that App Bridge's fetch wrapper
 * intercepts during the session-token bootstrap. Either way it ends with
 * the browser's top window landing on Shopify's own confirmation page,
 * where the merchant approves or declines the charge.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`[app.billing.start loader] ${request.method} ${request.url}`);
  const { session, billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const returnUrl = billingReturnUrl(session.shop, url.searchParams.get("host"));
  const requestedPlan = url.searchParams.get("plan");
  const tier: PlanTier = requestedPlan === "team" ? "team" : "standard";
  console.log(`[app.billing.start loader] shop=${session.shop} tier=${tier} returnUrl=${returnUrl}`);
  await billing.request({
    plan: tier === "team" ? SUBSCRIPTION_PLAN_TEAM : SUBSCRIPTION_PLAN,
    isTest: BILLING_IS_TEST,
    returnUrl,
  });
};
