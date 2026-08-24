import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate, BILLING_IS_TEST } from "../shopify.server";
import { SUBSCRIPTION_PLAN } from "../billing-plan";
import { saveSubscriptionFromShopify } from "../subscription.server";

/**
 * Shopify's confirmation page redirects here with a plain top-level
 * navigation (no session token, no `host`) after the merchant approves or
 * declines, so `?shop=` (set on the returnUrl in app.billing.start.tsx) is
 * what lets authenticate.admin() bounce this back into the embedded admin
 * context, the same way auth.google.callback.tsx does for the Google OAuth
 * return trip.
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
  const { session, billing } = await authenticate.admin(request);

  const { appSubscriptions } = await billing.check({
    plans: [SUBSCRIPTION_PLAN],
    isTest: BILLING_IS_TEST,
  });

  const subscription = appSubscriptions[0];
  if (subscription) {
    await saveSubscriptionFromShopify(session.shop, subscription);
    return redirect(`/app?shop=${encodeURIComponent(session.shop)}&billingApproved=1`);
  }

  return redirect(`/app?shop=${encodeURIComponent(session.shop)}&billingDeclined=1`);
};
