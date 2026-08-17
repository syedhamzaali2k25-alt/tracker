import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCachedDiagnostic } from "../diagnostic-cache.server";
import { deleteGoogleConnection } from "../google-account.server";
import { deletePushBatches } from "../push-batches.server";

/**
 * Mandatory GDPR webhook: sent 48 hours after a store owner uninstalls the
 * app (or requests erasure), asking every app to delete that shop's data.
 * Unlike customers/data_request and customers/redact, this one is
 * substantive for us — we do hold shop-scoped data (sessions, the cached
 * diagnostic).
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  await db.session.deleteMany({ where: { shop } });
  await deleteCachedDiagnostic(shop);
  await deleteGoogleConnection(shop);
  await deletePushBatches(shop);

  return new Response();
};
