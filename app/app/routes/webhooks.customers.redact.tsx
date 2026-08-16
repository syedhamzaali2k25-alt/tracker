import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * Mandatory GDPR webhook: a request to erase a specific customer's data,
 * sent 48 hours after a redaction request (or store deletion).
 *
 * This app never stores customer PII — nothing is keyed by customer id —
 * so there's nothing to delete here.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  return new Response();
};
