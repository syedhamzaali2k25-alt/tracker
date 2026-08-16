import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR webhook: a merchant (or Shopify, on a customer's behalf)
 * requesting the data this app holds about one of their customers.
 *
 * This app never stores customer PII — it only reads aggregate product,
 * inventory, and order-total data from Shopify at request time, and keeps
 * nothing keyed by customer. There's nothing to return.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
