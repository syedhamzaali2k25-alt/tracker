import db from "./db.server";
import { planTierFromName, type PlanTier } from "./billing-plan";

/** Mirrors Shopify's AppSubscription.status verbatim. */
export type ShopifySubscriptionStatus =
  | "ACTIVE"
  | "CANCELLED"
  | "DECLINED"
  | "EXPIRED"
  | "FROZEN"
  | "PENDING";

export interface StoredSubscription {
  shopifySubscriptionId: string | null;
  status: ShopifySubscriptionStatus;
  isTest: boolean;
  planTier: PlanTier;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}

/**
 * The gate states the dashboard actually needs to tell apart. "trialing"
 * and "active" are both fully unlocked; the difference is only what the
 * banner says. Everything else is locked, but "cancelled" is kept distinct
 * from "none" so a lapsed merchant sees "resubscribe" copy instead of the
 * first-time pitch, and still keeps read access (sync/dashboard/sheet).
 */
export type SubscriptionGateState =
  | "none"
  | "trialing"
  | "active"
  | "cancelled"
  | "declined"
  | "expired"
  | "frozen"
  | "pending";

export function gateState(sub: StoredSubscription | null): SubscriptionGateState {
  if (!sub) return "none";
  switch (sub.status) {
    case "ACTIVE":
      return sub.trialEndsAt && sub.trialEndsAt.getTime() > Date.now() ? "trialing" : "active";
    case "CANCELLED":
      return "cancelled";
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return "expired";
    case "FROZEN":
      return "frozen";
    case "PENDING":
      return "pending";
    default:
      return "none";
  }
}

/** The one thing every gated action (push, undo, the weekly email) actually checks. */
export function hasPushAccess(sub: StoredSubscription | null): boolean {
  const state = gateState(sub);
  return state === "trialing" || state === "active";
}

/**
 * Whether this shop is unlocked AND on the higher Team tier — the extra
 * gate for Team-only features (daily sync, 12mo history, the price-drop
 * email alert). Mirrors hasPushAccess's shape: false for a lapsed or
 * never-subscribed shop, even one whose stored planTier happens to say
 * "team" from a previous subscription.
 */
export function isTeamPlan(sub: StoredSubscription | null): boolean {
  return hasPushAccess(sub) && sub?.planTier === "team";
}

/**
 * Whole days left in the trial, for the "N days left" banner. Computed here
 * (server-side, at loader time) rather than in the component with
 * `Date.now()` at render time, which React's purity rules disallow.
 */
export function trialDaysLeft(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86_400_000));
}

export async function getSubscription(shop: string): Promise<StoredSubscription | null> {
  const row = await db.subscription.findUnique({ where: { shop } });
  if (!row) return null;
  return {
    shopifySubscriptionId: row.shopifySubscriptionId,
    status: row.status as ShopifySubscriptionStatus,
    isTest: row.isTest,
    planTier: row.planTier === "team" ? "team" : "standard",
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

/**
 * Full refresh from a live Shopify AppSubscription (billing.request's or
 * billing.check's response), used right after the merchant lands back from
 * the confirmation page. Shopify doesn't hand back a trialEndsAt directly,
 * so it's derived once here from createdAt + trialDays and stored, rather
 * than recomputed from "now" on every gate check. planTier is derived from
 * `sub.name` — the exact plan name Shopify confirms the merchant approved —
 * rather than trusting whichever plan our own UI last linked to, so it stays
 * correct even if the merchant approved a different plan than the one they
 * clicked (e.g. an already-open confirmation tab for the other plan).
 */
export async function saveSubscriptionFromShopify(
  shop: string,
  sub: {
    id: string;
    name: string;
    status: string;
    test: boolean;
    trialDays: number;
    createdAt: string;
    currentPeriodEnd: string;
  },
): Promise<void> {
  const trialEndsAt =
    sub.trialDays > 0
      ? new Date(new Date(sub.createdAt).getTime() + sub.trialDays * 24 * 60 * 60 * 1000)
      : null;
  const data = {
    shopifySubscriptionId: sub.id,
    status: sub.status,
    isTest: sub.test,
    planTier: planTierFromName(sub.name),
    trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
  };
  await db.subscription.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}

/**
 * Status-only update from the APP_SUBSCRIPTIONS_UPDATE webhook, whose
 * payload carries just { admin_graphql_api_id, status } — not trial,
 * period-end, or plan-name info. Deliberately leaves trialEndsAt/
 * currentPeriodEnd/planTier alone on an existing row rather than resetting
 * them; gateState() only consults trialEndsAt while status is still ACTIVE,
 * so a stale value here is harmless once the status moves to
 * CANCELLED/DECLINED/EXPIRED/FROZEN. The create-branch (only reachable if
 * this webhook somehow arrives before the shop ever went through
 * app.billing.callback.tsx) has no plan name to go on either, so it
 * defaults to "standard" — the same safe-default pattern already used for
 * isTest here.
 */
export async function updateSubscriptionStatus(
  shop: string,
  shopifySubscriptionId: string,
  status: string,
): Promise<void> {
  await db.subscription.upsert({
    where: { shop },
    create: { shop, shopifySubscriptionId, status, isTest: false, planTier: "standard" },
    update: { shopifySubscriptionId, status },
  });
}

/** Used by the shop/redact GDPR webhook and app/uninstalled to purge a shop's data. */
export async function deleteSubscription(shop: string): Promise<void> {
  await db.subscription.deleteMany({ where: { shop } });
}
