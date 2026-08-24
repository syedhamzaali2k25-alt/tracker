import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { updateSubscriptionStatus } from "../subscription.server";

/**
 * The only signal we get when a merchant changes their subscription from
 * inside Shopify admin rather than our own app, most importantly
 * cancelling. Our own billing confirmation redirect (app.billing.callback)
 * covers approvals/declines that happen through our "Upgrade" flow, but a
 * cancellation from Shopify's own subscription management screen never
 * touches our app at all otherwise, so without this webhook a cancelled
 * shop would keep pushing changes indefinitely.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const subscription = payload.app_subscription as
    | { admin_graphql_api_id?: string; status?: string }
    | undefined;

  if (!subscription?.admin_graphql_api_id || !subscription.status) {
    console.error(`[webhooks/app_subscriptions/update] ${shop}: payload missing app_subscription fields`, payload);
    return new Response();
  }

  await updateSubscriptionStatus(shop, subscription.admin_graphql_api_id, subscription.status);

  return new Response();
};
