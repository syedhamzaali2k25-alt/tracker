import type { LoaderFunctionArgs } from "react-router";
import { authenticate, BILLING_IS_TEST } from "../shopify.server";
import { SUBSCRIPTION_PLAN } from "../billing-plan";

function billingReturnUrl(shop: string): string {
  const appUrl = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
  return `${appUrl}/app/billing/callback?shop=${encodeURIComponent(shop)}`;
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
  const { session, billing } = await authenticate.admin(request);
  await billing.request({
    plan: SUBSCRIPTION_PLAN,
    isTest: BILLING_IS_TEST,
    returnUrl: billingReturnUrl(session.shop),
  });
};
