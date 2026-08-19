import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { deleteCachedDiagnostic } from "../diagnostic-cache.server";
import { deleteGoogleConnection } from "../google-account.server";
import { deletePushBatches } from "../push-batches.server";
import { deleteShopSettings } from "../shop-settings.server";
import { deleteWatchmanRun } from "../watchman-run.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await deleteCachedDiagnostic(shop);
  await deleteGoogleConnection(shop);
  await deletePushBatches(shop);
  await deleteShopSettings(shop);
  await deleteWatchmanRun(shop);

  return new Response();
};
