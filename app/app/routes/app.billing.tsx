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
import { SUBSCRIPTION_PLAN, SUBSCRIPTION_PRICE, SUBSCRIPTION_TRIAL_DAYS } from "../billing-plan";
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
  const subscription = await getSubscription(session.shop);

  return {
    state: gateState(subscription),
    canCancel: hasPushAccess(subscription) && subscription?.shopifySubscriptionId != null,
    trialDaysLeft: trialDaysLeft(subscription?.trialEndsAt ?? null),
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
    body: "Sync, the dashboard, and the Google Sheet are free. Pushing changes, History, Undo, and the weekly email alert need the paid plan.",
  },
  pending: {
    heading: "Subscription pending",
    body: "A subscription confirmation is waiting on approval. If you closed that page, start again below.",
  },
  trialing: {
    heading: "Free trial",
    body: "You're in the free trial. All features are unlocked.",
  },
  active: {
    heading: "Active",
    body: "Your subscription is active. All features are unlocked.",
  },
  cancelled: {
    heading: "Cancelled",
    body: "Your subscription was cancelled. Sync, the dashboard, and the Google Sheet still work; pushing changes, History, Undo, and the weekly email need a new subscription.",
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
  const showResubscribe = !loaderData.canCancel || justCancelled;

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
          <s-paragraph>
            Plan: <s-text type="strong">{SUBSCRIPTION_PLAN}</s-text>, $
            {SUBSCRIPTION_PRICE}/month, {SUBSCRIPTION_TRIAL_DAYS}-day free trial on a new
            subscription.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section>
        {showResubscribe ? (
          <s-button variant="primary" href="/app/billing/start">
            {loaderData.state === "none" || loaderData.state === "pending"
              ? "Start free trial"
              : "Resubscribe"}
          </s-button>
        ) : (
          <s-button
            tone="critical"
            onClick={cancel}
            {...(isCancelling ? { loading: true } : {})}
          >
            Cancel subscription
          </s-button>
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
