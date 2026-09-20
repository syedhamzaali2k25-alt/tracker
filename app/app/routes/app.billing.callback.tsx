import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, BILLING_IS_TEST } from "../shopify.server";
import { SUBSCRIPTION_PLAN } from "../billing-plan";
import { saveSubscriptionFromShopify } from "../subscription.server";

/**
 * Shopify's confirmation page redirects here with a plain top-level
 * navigation (no session token) after the merchant approves or declines,
 * carrying `shop` and `host` because app.billing.start.tsx put both on the
 * returnUrl. Both get forwarded on the redirect back into `/app` below, so
 * authenticate.admin() there has everything it needs already on the URL
 * instead of falling back to a bare App Bridge bootstrap page and trusting
 * its client-side JS to redirect correctly on its own.
 *
 * Shopify doesn't append anything telling us which way the merchant went,
 * so this re-checks the live subscription instead of guessing. An approved
 * charge shows up in billing.check() immediately; a decline (or an expired,
 * unanswered confirmation) doesn't, and this redirects with a generic
 * "not approved" flag either way. The APP_SUBSCRIPTIONS_UPDATE webhook is
 * what fills in the precise status (DECLINED vs EXPIRED) moments later, so
 * the redirect here only needs to be a safe, honest default in the meantime.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`[app.billing.callback loader] ${request.method} ${request.url}`);
  const { session, billing } = await authenticate.admin(request);
  const host = new URL(request.url).searchParams.get("host");

  const { appSubscriptions } = await billing.check({
    plans: [SUBSCRIPTION_PLAN],
    isTest: BILLING_IS_TEST,
  });

  const params = new URLSearchParams({ shop: session.shop });
  if (host) params.set("host", host);

  const subscription = appSubscriptions[0];
  if (subscription) {
    await saveSubscriptionFromShopify(session.shop, subscription);
    params.set("billingApproved", "1");
    const target = `/app?${params.toString()}`;
    console.log(`[app.billing.callback loader] shop=${session.shop} approved, redirecting to ${target}`);
    return redirect(target);
  }

  params.set("billingDeclined", "1");
  const target = `/app?${params.toString()}`;
  console.log(`[app.billing.callback loader] shop=${session.shop} not approved, redirecting to ${target}`);
  return redirect(target);
};
