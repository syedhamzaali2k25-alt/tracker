import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runDiagnostic } from "~lib/pipeline/runDiagnostic.js";
import {
  buildPreviewFromSheet,
  type ChangePreview,
} from "~lib/pipeline/previewChanges.js";
import { applyChanges, type ApplyChangesResult } from "~lib/pipeline/applyChanges.js";
import { writeDiagnostic } from "~lib/sheets/diagnosticSheet.js";
import type { FixEntry } from "~lib/sheets/fixSheet.js";
import { config } from "~lib/config.js";
import type { ShopContext } from "~lib/shopify/client.js";
import type { DiagnosticSummary, MarginRow } from "~lib/types.js";
import { getCachedDiagnostic, setCachedDiagnostic } from "../diagnostic-cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

/** authenticate.admin() always returns an active session with a token; the check is defensive. */
function toShopContext(session: { shop: string; accessToken?: string }): ShopContext {
  if (!session.accessToken) {
    throw new Error("No access token on the current session — try reinstalling the app.");
  }
  return { shop: session.shop, accessToken: session.accessToken };
}

interface SyncResult {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

interface CreateSheetResult {
  sheetUrl: string;
}

interface PreviewResult {
  preview: ChangePreview;
}

interface ApplyResult {
  result: ApplyChangesResult;
}

interface ActionError {
  error: string;
}

type ActionResponse =
  | SyncResult
  | CreateSheetResult
  | PreviewResult
  | ApplyResult
  | ActionError;

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResponse> => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  try {
    if (intent === "sync") {
      const shopContext = toShopContext(session);
      console.log(`[action] intent=sync session.shop=${session.shop} shopContext.shop=${shopContext.shop}`);
      const { rows, summary } = await runDiagnostic(shopContext);
      await setCachedDiagnostic(session.shop, { rows, summary });
      return { rows, summary } satisfies SyncResult;
    }

    if (intent === "createSheet") {
      // Reuse the last diagnostic for this shop instead of round-tripping
      // rows/summary through the browser (a multi-megabyte POST on a large
      // catalog) or paying for a second Shopify fetch. Falls back to a
      // fresh runDiagnostic() if nothing's cached yet (e.g. server
      // restarted since the last sync).
      const shopContext = toShopContext(session);
      console.log(`[action] intent=createSheet session.shop=${session.shop} shopContext.shop=${shopContext.shop}`);
      const cached = await getCachedDiagnostic(session.shop);
      const { rows, summary } = cached ?? (await runDiagnostic(shopContext));
      if (!cached) await setCachedDiagnostic(session.shop, { rows, summary });

      await writeDiagnostic(rows, summary);
      return {
        sheetUrl: `https://docs.google.com/spreadsheets/d/${config.google.sheetId}/edit`,
      } satisfies CreateSheetResult;
    }

    if (intent === "preview") {
      const preview = await buildPreviewFromSheet();
      return { preview } satisfies PreviewResult;
    }

    if (intent === "apply") {
      const shopContext = toShopContext(session);
      console.log(`[action] intent=apply session.shop=${session.shop} shopContext.shop=${shopContext.shop}`);
      const entries = JSON.parse(String(formData.get("entries"))) as FixEntry[];
      const result = await applyChanges(shopContext, entries);
      return { result } satisfies ApplyResult;
    }

    throw new Error(`Unknown intent: ${intent}`);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies ActionError;
  }
};

function formatMoney(amount: number, currencyCode: string): string {
  return currencyCode ? `${currencyCode} ${amount.toFixed(2)}` : amount.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const PUSH_MODAL_ID = "push-changes-modal";

export default function Dashboard() {
  const shopify = useAppBridge();
  // Tracks which preview object confirmPush already submitted, so a second
  // click can't resubmit it. Not synced from the fetcher via an effect —
  // React's rules-of-hooks lint (correctly) flags setState-in-effect as a
  // cascading-render risk. Instead this is set once, in the click handler,
  // and activePreview below is a plain derived comparison: a fresh "Push
  // changes" click produces a new preview object, which naturally differs
  // from submittedPreview and re-activates without any reset needed.
  const [submittedPreview, setSubmittedPreview] = useState<ChangePreview | null>(
    null,
  );

  const syncFetcher = useFetcher<typeof action>();
  const createSheetFetcher = useFetcher<typeof action>();
  const previewFetcher = useFetcher<typeof action>();
  const applyFetcher = useFetcher<typeof action>();

  const isSyncing =
    ["loading", "submitting"].includes(syncFetcher.state) &&
    syncFetcher.formMethod === "POST";
  const isCreatingSheet =
    ["loading", "submitting"].includes(createSheetFetcher.state) &&
    createSheetFetcher.formMethod === "POST";
  const isPreviewLoading =
    ["loading", "submitting"].includes(previewFetcher.state) &&
    previewFetcher.formMethod === "POST";
  const isApplying =
    ["loading", "submitting"].includes(applyFetcher.state) &&
    applyFetcher.formMethod === "POST";

  const errorMessage =
    syncFetcher.data && "error" in syncFetcher.data ? syncFetcher.data.error : undefined;
  const result =
    syncFetcher.data && "rows" in syncFetcher.data ? syncFetcher.data : undefined;
  const hasSynced = result !== undefined;

  const sheetUrl =
    createSheetFetcher.data && "sheetUrl" in createSheetFetcher.data
      ? createSheetFetcher.data.sheetUrl
      : undefined;

  const previewData =
    previewFetcher.data && "preview" in previewFetcher.data
      ? previewFetcher.data.preview
      : undefined;
  const activePreview =
    previewData && previewData !== submittedPreview ? previewData : undefined;

  const sync = () => syncFetcher.submit({ intent: "sync" }, { method: "POST" });

  const createSheet = () =>
    createSheetFetcher.submit({ intent: "createSheet" }, { method: "POST" });

  const pushChanges = () =>
    previewFetcher.submit({ intent: "preview" }, { method: "POST" });

  const confirmPush = () => {
    if (!activePreview) return;
    applyFetcher.submit(
      { intent: "apply", entries: JSON.stringify(activePreview.entries) },
      { method: "POST" },
    );
    // Marking this preview as submitted clears activePreview on the very
    // next render — a rapid second click can't reuse it while the first
    // apply is still in flight.
    setSubmittedPreview(activePreview);
  };

  // Open the modal only once the preview has actually loaded, and only when
  // there's something to confirm — never for a zero-change result.
  useEffect(() => {
    if (!previewFetcher.data) return;

    if ("error" in previewFetcher.data) {
      shopify.toast.show(previewFetcher.data.error, { isError: true });
      return;
    }
    if (!("preview" in previewFetcher.data)) return;

    if (previewFetcher.data.preview.count === 0) {
      shopify.toast.show("No New Price / New Cost values found in the Fix tab.");
      return;
    }

    shopify.modal.show(PUSH_MODAL_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewFetcher.data]);

  // Report the apply outcome and close the modal, whether it succeeded or not.
  useEffect(() => {
    if (!applyFetcher.data) return;

    shopify.modal.hide(PUSH_MODAL_ID);

    if ("error" in applyFetcher.data) {
      shopify.toast.show(applyFetcher.data.error, { isError: true });
      return;
    }
    if (!("result" in applyFetcher.data)) return;

    const { pricesUpdated, costsUpdated } = applyFetcher.data.result;
    shopify.toast.show(`Updated ${pricesUpdated} price(s) and ${costsUpdated} cost(s) in Shopify.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyFetcher.data]);

  const currencyCode = result?.summary.currencyCode ?? "";
  // Below-cost products get their own section (the urgent list) instead of
  // being mixed in with everything else and told apart only by a badge.
  const belowCostRows = result
    ? result.rows.filter((row) => row.flag === "below-cost")
    : [];
  const lowMarginRows = result
    ? result.rows.filter((row) => row.flag === "low-margin").slice(0, 20)
    : [];

  return (
    <s-page heading="Margin Tracker">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={sync}
        {...(isSyncing ? { loading: true } : {})}
      >
        Sync from Shopify
      </s-button>

      {result && (
        <s-button
          slot="secondary-actions"
          onClick={createSheet}
          {...(isCreatingSheet ? { loading: true } : {})}
        >
          Create sheet
        </s-button>
      )}
      <s-button
        slot="secondary-actions"
        onClick={pushChanges}
        {...(isPreviewLoading ? { loading: true } : {})}
      >
        Push changes
      </s-button>

      {errorMessage && (
        <s-banner tone="critical" heading="Sync failed">
          <s-paragraph>{errorMessage}</s-paragraph>
        </s-banner>
      )}

      {!hasSynced && !isSyncing && !errorMessage && (
        <s-section heading="Find out what's costing you money">
          <s-paragraph>
            Sync checks every product&apos;s cost against its price and the
            last 30 days of sales, then tells you exactly how much money
            you&apos;re losing on anything selling below cost — plus which
            products are priced too thin to be worth selling. This only
            reads from Shopify; nothing in your store changes.
          </s-paragraph>
        </s-section>
      )}

      {sheetUrl && (
        <s-banner tone="success" heading="Sheet created">
          <s-paragraph>
            <s-link href={sheetUrl} target="_blank">
              Open the Google Sheet
            </s-link>{" "}
            to review the numbers or type New Price / New Cost values in the
            Fix tab, then come back and click &quot;Push changes&quot;.
          </s-paragraph>
        </s-banner>
      )}

      {result && (
        <>
          {result.summary.belowCostCount > 0 ? (
            <s-banner
              tone="critical"
              heading={`You're losing ${formatMoney(
                result.summary.belowCostLoss,
                currencyCode,
              )} in the last 30 days on ${pluralize(
                result.summary.belowCostCount,
                "product",
              )}`}
            >
              <s-paragraph>
                Fixing their prices would recover this every 30 days. The
                products are listed below.
              </s-paragraph>
            </s-banner>
          ) : (
            <s-banner tone="success" heading="Nothing is selling below cost">
              <s-paragraph>
                Every product with a recorded cost currently covers it.
              </s-paragraph>
            </s-banner>
          )}

          {result.summary.noCostCount > 0 && (
            <s-section heading="Most of your catalog can't be checked yet">
              <s-stack direction="block" gap="small">
                <s-paragraph>
                  <s-text tone="warning">
                    {pluralize(result.summary.noCostCount, "product")}
                  </s-text>{" "}
                  have no cost recorded in Shopify, so margin can&apos;t be
                  calculated for them at all — this is the single most
                  useful thing you can fix before your next sync.
                </s-paragraph>
                <s-paragraph>
                  In Shopify admin, open each product and add a{" "}
                  <s-text type="strong">Cost per item</s-text> value under
                  Pricing, then sync again.
                </s-paragraph>
              </s-stack>
            </s-section>
          )}

          {belowCostRows.length > 0 && (
            <s-section heading={`Selling below cost (${belowCostRows.length})`}>
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header listSlot="secondary">Variant</s-table-header>
                  <s-table-header>SKU</s-table-header>
                  <s-table-header format="currency">Cost</s-table-header>
                  <s-table-header format="currency">Price</s-table-header>
                  <s-table-header format="numeric">Margin %</s-table-header>
                  <s-table-header format="numeric">Sold (30d)</s-table-header>
                  <s-table-header format="currency">
                    Recovers if fixed (30d)
                  </s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {belowCostRows.map((row) => (
                    <s-table-row key={row.variantId}>
                      <s-table-cell>{row.productTitle}</s-table-cell>
                      <s-table-cell>{row.variantTitle}</s-table-cell>
                      <s-table-cell>{row.sku}</s-table-cell>
                      <s-table-cell>
                        {row.cost === null
                          ? "—"
                          : formatMoney(row.cost, row.currencyCode || currencyCode)}
                      </s-table-cell>
                      <s-table-cell>
                        {formatMoney(row.price, row.currencyCode || currencyCode)}
                      </s-table-cell>
                      <s-table-cell>{formatPercent(row.marginPct)}</s-table-cell>
                      <s-table-cell>{row.unitsSold30d}</s-table-cell>
                      <s-table-cell>
                        {row.profit30d === null ? (
                          "—"
                        ) : (
                          <s-text tone="critical">
                            {formatMoney(
                              Math.abs(row.profit30d),
                              row.currencyCode || currencyCode,
                            )}
                          </s-text>
                        )}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}

          {lowMarginRows.length > 0 && (
            <s-section
              heading={`Other thin-margin products (${lowMarginRows.length})`}
            >
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Product</s-table-header>
                  <s-table-header listSlot="secondary">Variant</s-table-header>
                  <s-table-header>SKU</s-table-header>
                  <s-table-header format="currency">Cost</s-table-header>
                  <s-table-header format="currency">Price</s-table-header>
                  <s-table-header format="numeric">Margin %</s-table-header>
                  <s-table-header format="numeric">Sold (30d)</s-table-header>
                  <s-table-header format="currency">Profit (30d)</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {lowMarginRows.map((row) => (
                    <s-table-row key={row.variantId}>
                      <s-table-cell>{row.productTitle}</s-table-cell>
                      <s-table-cell>{row.variantTitle}</s-table-cell>
                      <s-table-cell>{row.sku}</s-table-cell>
                      <s-table-cell>
                        {row.cost === null
                          ? "—"
                          : formatMoney(row.cost, row.currencyCode || currencyCode)}
                      </s-table-cell>
                      <s-table-cell>
                        {formatMoney(row.price, row.currencyCode || currencyCode)}
                      </s-table-cell>
                      <s-table-cell>{formatPercent(row.marginPct)}</s-table-cell>
                      <s-table-cell>{row.unitsSold30d}</s-table-cell>
                      <s-table-cell>
                        {row.profit30d === null
                          ? "—"
                          : formatMoney(row.profit30d, row.currencyCode || currencyCode)}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}
        </>
      )}

      <s-modal id={PUSH_MODAL_ID} heading="Confirm changes to Shopify">
        {activePreview && (
          <s-stack direction="block" gap="base">
            <s-paragraph>
              You are about to change{" "}
              <s-text type="strong">{activePreview.count}</s-text> price(s)/cost(s).
            </s-paragraph>
            <s-paragraph>
              Biggest increase: +{activePreview.biggestIncreasePct.toFixed(1)}%
            </s-paragraph>
            <s-paragraph>
              Biggest decrease:{" "}
              {activePreview.biggestDecreasePct === 0
                ? "none"
                : `${activePreview.biggestDecreasePct.toFixed(1)}%`}
            </s-paragraph>
            {activePreview.belowCostAfterChange.length > 0 && (
              <s-banner
                tone="warning"
                heading={`${activePreview.belowCostAfterChange.length} product(s) would end up BELOW their cost`}
              >
                <s-unordered-list>
                  {activePreview.belowCostAfterChange.map((entry) => (
                    <s-list-item key={entry.variantId}>
                      {entry.productTitle} {entry.variantTitle}
                    </s-list-item>
                  ))}
                </s-unordered-list>
              </s-banner>
            )}
            {activePreview.zeroPriceAfterChange.length > 0 && (
              <s-banner
                tone="warning"
                heading={`${activePreview.zeroPriceAfterChange.length} product(s) would become 0`}
              >
                <s-unordered-list>
                  {activePreview.zeroPriceAfterChange.map((entry) => (
                    <s-list-item key={entry.variantId}>
                      {entry.productTitle} {entry.variantTitle}
                    </s-list-item>
                  ))}
                </s-unordered-list>
              </s-banner>
            )}
          </s-stack>
        )}

        <s-button
          slot="primary-action"
          variant="primary"
          tone="critical"
          onClick={confirmPush}
          disabled={!activePreview || isApplying}
          {...(isApplying ? { loading: true } : {})}
        >
          Push {activePreview?.count ?? 0} change(s) to Shopify
        </s-button>
        <s-button
          slot="secondary-actions"
          onClick={() => shopify.modal.hide(PUSH_MODAL_ID)}
        >
          Cancel
        </s-button>
      </s-modal>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
