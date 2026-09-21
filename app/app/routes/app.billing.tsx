import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { PLANS, SUBSCRIPTION_TRIAL_DAYS, billingStartUrl, type PlanTier } from "../billing-plan";
import {
  gateState,
  getSubscription,
  hasPushAccess,
  trialDaysLeft,
  updateSubscriptionStatus,
  type SubscriptionGateState,
} from "../subscription.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const subscription = await getSubscription(session.shop);
  const subscribed = hasPushAccess(subscription) && subscription?.shopifySubscriptionId != null;

  return {
    state: gateState(subscription),
    canCancel: subscribed,
    currentTier: subscribed ? subscription!.planTier : null,
    trialDaysLeft: trialDaysLeft(subscription?.trialEndsAt ?? null),
    billingStartUrl: {
      standard: billingStartUrl(session.shop, host, "standard"),
      team: billingStartUrl(session.shop, host, "team"),
    },
  };
};

interface CancelResult {
  cancelled: true;
}

interface CancelError {
  error: string;
}

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<CancelResult | CancelError> => {
  const { session, billing } = await authenticate.admin(request);
  const subscription = await getSubscription(session.shop);

  if (!subscription?.shopifySubscriptionId) {
    return { error: "No subscription to cancel." } satisfies CancelError;
  }

  try {
    await billing.cancel({
      subscriptionId: subscription.shopifySubscriptionId,
      isTest: subscription.isTest,
      prorate: true,
    });
    // The APP_SUBSCRIPTIONS_UPDATE webhook confirms this independently;
    // updated here too so the page reflects it without waiting on delivery.
    await updateSubscriptionStatus(session.shop, subscription.shopifySubscriptionId, "CANCELLED");
    return { cancelled: true } satisfies CancelResult;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies CancelError;
  }
};

const STATE_COPY: Record<SubscriptionGateState, { heading: string; body: string }> = {
  none: {
    heading: "No active subscription",
    body: "Sync, the dashboard, and the Google Sheet are free. Pushing changes, History, and Undo need a paid plan. Pick a plan below to start a free trial.",
  },
  pending: {
    heading: "Subscription pending",
    body: "A subscription confirmation is waiting on approval. If you closed that page, start again below.",
  },
  trialing: {
    heading: "Free trial",
    body: "You're in the free trial. All features on your plan are unlocked.",
  },
  active: {
    heading: "Active",
    body: "Your subscription is active. All features on your plan are unlocked.",
  },
  cancelled: {
    heading: "Cancelled",
    body: "Your subscription was cancelled. Sync, the dashboard, and the Google Sheet still work; pushing changes, History, and Undo need a new subscription.",
  },
  declined: {
    heading: "Declined",
    body: "The subscription charge wasn't approved.",
  },
  expired: {
    heading: "Expired",
    body: "The subscription confirmation expired before it was approved.",
  },
  frozen: {
    heading: "Frozen",
    body: "Shopify has paused billing for this store.",
  },
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  standard: [
    "Weekly sync",
    "Full dashboard",
    "Push changes, History & Undo",
    "3 months of push history",
  ],
  team: [
    "Everything in Standard",
    "Daily sync",
    "12 months of push history",
    "Email alert when a product's price drops below cost",
    "Share the Google Sheet with your whole team",
  ],
};

interface PlanCardProps {
  tier: PlanTier;
  isCurrent: boolean;
  ctaLabel: string;
  ctaHref: string;
}

function PlanCard({ tier, isCurrent, ctaLabel, ctaHref }: PlanCardProps) {
  const plan = PLANS[tier];
  return (
    <s-section heading={isCurrent ? `${plan.name} (current plan)` : plan.name}>
      <s-stack direction="block" gap="base">
        <s-paragraph>
          <s-text type="strong">
            ${plan.price}/month, {SUBSCRIPTION_TRIAL_DAYS}-day free trial on a new subscription.
          </s-text>
        </s-paragraph>
        <s-unordered-list>
          {PLAN_FEATURES[tier].map((feature) => (
            <s-list-item key={feature}>{feature}</s-list-item>
          ))}
        </s-unordered-list>
        {!isCurrent && (
          <s-button variant={tier === "team" ? "primary" : undefined} href={ctaHref} target="_top">
            {ctaLabel}
          </s-button>
        )}
      </s-stack>
    </s-section>
  );
}

export default function Billing() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData<typeof loader>();
  const cancelFetcher = useFetcher<typeof action>();

  const isCancelling =
    ["loading", "submitting"].includes(cancelFetcher.state) &&
    cancelFetcher.formMethod === "POST";

  const cancel = () => cancelFetcher.submit({ intent: "cancel" }, { method: "POST" });

  useEffect(() => {
    if (!cancelFetcher.data) return;
    if ("error" in cancelFetcher.data) {
      shopify.toast.show(cancelFetcher.data.error, { isError: true });
      return;
    }
    shopify.toast.show("Subscription cancelled.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelFetcher.data]);

  const copy = STATE_COPY[loaderData.state];
  const justCancelled = cancelFetcher.data && "cancelled" in cancelFetcher.data;
  const isSubscribed = loaderData.canCancel && !justCancelled;
  const ctaLabel = loaderData.state === "none" || loaderData.state === "pending" ? "Start free trial" : "Resubscribe";

  return (
    <s-page heading="Billing">
      <s-section heading={copy.heading}>
        <s-stack direction="block" gap="base">
          <s-paragraph>{copy.body}</s-paragraph>
          {loaderData.state === "trialing" && loaderData.trialDaysLeft !== null && (
            <s-paragraph>
              <s-text type="strong">
                {loaderData.trialDaysLeft} day{loaderData.trialDaysLeft === 1 ? "" : "s"} left in your trial.
              </s-text>
            </s-paragraph>
          )}
          {isSubscribed && (
            <s-paragraph>
              To switch plans, cancel your current subscription below, then start the other plan&apos;s free
              trial. Shopify doesn&apos;t support moving directly between two paid plans.
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-stack direction="inline" gap="base">
        <PlanCard
          tier="standard"
          isCurrent={isSubscribed && loaderData.currentTier === "standard"}
          ctaLabel={ctaLabel}
          ctaHref={loaderData.billingStartUrl.standard}
        />
        <PlanCard
          tier="team"
          isCurrent={isSubscribed && loaderData.currentTier === "team"}
          ctaLabel={ctaLabel}
          ctaHref={loaderData.billingStartUrl.team}
        />
      </s-stack>

      {isSubscribed && (
        <s-section>
          <s-button tone="critical" onClick={cancel} {...(isCancelling ? { loading: true } : {})}>
            Cancel subscription
          </s-button>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
