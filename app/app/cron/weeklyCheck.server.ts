// Entry point for the weekly watchman job — run via `npm run cron:weekly-
// check` (tsx, not through the Vite/React Router build) as a separate
// Railway service pointing at this same repo, on a weekly cron schedule,
// with a startCommand override instead of `npm run docker-start`. See
// README "Weekly margin alerts" for the Railway setup.
//
// Deliberately its own script rather than an HTTP route on the web
// service: Railway's Cron Job service type runs a command to completion on
// a schedule and doesn't need the web process to be up to do it.
import "@shopify/shopify-app-react-router/adapters/node";
import type { ShopContext } from "~lib/shopify/client.js";
import { runDiagnostic } from "~lib/pipeline/runDiagnostic.js";
import { fetchShopEmail } from "~lib/shopify/queries.js";
import { diffMarginRows, hasChanges } from "~lib/pipeline/weeklyDiff.js";
import { buildWeeklyAlertEmail } from "~lib/pipeline/weeklyAlertEmail.js";
import db from "../db.server";
import { decrypt, isEncrypted } from "../crypto.server";
import { getShopSettings } from "../shop-settings.server";
import { getLastWatchmanRun, saveWatchmanRun } from "../watchman-run.server";
import { sendEmail } from "../email.server";

function decryptAccessToken(raw: string): string {
  return isEncrypted(raw) ? decrypt(raw) : raw;
}

/**
 * One shop's worth of work: re-run the diagnostic, diff against last week,
 * email if anything newly crossed into below-cost/low-margin and the
 * merchant hasn't turned that off, then save this run as the new baseline.
 * Any throw here is caught by the caller — a bad shop must not take down
 * the rest of the loop.
 */
async function checkShop(shopContext: ShopContext): Promise<void> {
  const shop = shopContext.shop;

  // fetchAllVariants/fetchUnitsSoldByVariant (inside runDiagnostic) go
  // through shopifyGraphQL, which tracks each shop's own throttle bucket
  // and backs off automatically — the Phase 0.4 rate limiting applies here
  // unchanged, with no extra plumbing needed in this script. Shops are
  // processed one at a time in the caller, not concurrently, so this is
  // the only Shopify traffic in flight for this shop at any moment.
  const { rows, summary } = await runDiagnostic(shopContext, (message) =>
    console.log(`[weekly-check] ${shop}: ${message}`),
  );

  const previous = await getLastWatchmanRun(shop);
  const diff = diffMarginRows(previous?.rows, rows);

  if (hasChanges(diff)) {
    const settings = await getShopSettings(shop);
    if (settings.emailAlerts) {
      const to = settings.alertEmail ?? (await fetchShopEmail(shopContext));
      if (to) {
        const email = buildWeeklyAlertEmail(shop, diff, summary.currencyCode);
        await sendEmail({ to, ...email });
        console.log(
          `[weekly-check] ${shop}: emailed ${to} — ${diff.newlyBelowCost.length} newly below cost, ${diff.newlyLowMargin.length} newly low-margin`,
        );
      } else {
        console.warn(`[weekly-check] ${shop}: has changes to report but no email address available (no override set, no Shopify shop email) — skipping send`);
      }
    } else {
      console.log(`[weekly-check] ${shop}: has changes but emailAlerts is off — not sending`);
    }
  } else {
    console.log(`[weekly-check] ${shop}: no new below-cost/low-margin products since last run`);
  }

  await saveWatchmanRun(shop, { rows, summary });
}

async function main(): Promise<void> {
  const sessions = await db.session.findMany({ where: { isOnline: false } });
  console.log(`[weekly-check] starting: ${sessions.length} installed shop(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const session of sessions) {
    const shopContext: ShopContext = {
      shop: session.shop,
      accessToken: decryptAccessToken(session.accessToken),
    };

    try {
      await checkShop(shopContext);
      succeeded++;
    } catch (error) {
      failed++;
      // Logged and swallowed on purpose — one shop's Shopify API error,
      // missing Google connection, or SendGrid failure must not stop the
      // rest of the shops in this run.
      console.error(`[weekly-check] ${session.shop}: failed, continuing with the next shop`, error);
    }
  }

  console.log(`[weekly-check] done: ${succeeded} succeeded, ${failed} failed`);
}

main()
  .catch((error) => {
    console.error("[weekly-check] fatal error outside the per-shop loop", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
