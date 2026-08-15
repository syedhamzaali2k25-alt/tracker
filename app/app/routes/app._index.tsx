import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { runDiagnostic } from "~lib/pipeline/runDiagnostic.js";
import type { DiagnosticSummary, MarginRow } from "~lib/types.js";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

interface DiagnosticActionData {
  rows: MarginRow[];
  summary: DiagnosticSummary;
}

interface DiagnosticActionError {
  error: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  try {
    const { rows, summary } = await runDiagnostic();
    return { rows, summary } satisfies DiagnosticActionData;
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    } satisfies DiagnosticActionError;
  }
};

const FLAG_TONE: Record<MarginRow["flag"], "critical" | "warning" | "neutral" | "success"> = {
  "below-cost": "critical",
  "low-margin": "warning",
  "no-cost": "neutral",
  ok: "success",
};

const FLAG_LABEL: Record<MarginRow["flag"], string> = {
  "below-cost": "Below cost",
  "low-margin": "Low margin",
  "no-cost": "No cost data",
  ok: "OK",
};

function formatMoney(amount: number, currencyCode: string): string {
  return currencyCode ? `${currencyCode} ${amount.toFixed(2)}` : amount.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default function Dashboard() {
  const fetcher = useFetcher<typeof action>();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const errorMessage =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : undefined;
  const result =
    fetcher.data && !("error" in fetcher.data) ? fetcher.data : undefined;
  const hasSynced = result !== undefined;

  const sync = () => fetcher.submit({}, { method: "POST" });

  const currencyCode = result?.summary.currencyCode ?? "";
  const worstRows = result ? result.rows.slice(0, 20) : [];

  return (
    <s-page heading="Margin Tracker">
      <s-button
        slot="primary-action"
        onClick={sync}
        {...(isLoading ? { loading: true } : {})}
      >
        Sync from Shopify
      </s-button>

      {errorMessage && (
        <s-banner tone="critical" heading="Sync failed">
          <s-paragraph>{errorMessage}</s-paragraph>
        </s-banner>
      )}

      {!hasSynced && !isLoading && !errorMessage && (
        <s-section heading="No data yet">
          <s-paragraph>
            Click &quot;Sync from Shopify&quot; to pull your products, their
            costs, and the last 30 days of sales, and see which products are
            selling at a thin or negative margin.
          </s-paragraph>
        </s-section>
      )}

      {result && (
        <>
          {result.summary.belowCostCount > 0 && (
            <s-banner
              tone="critical"
              heading={`${result.summary.belowCostCount} product(s) are selling BELOW COST`}
            >
              <s-paragraph>
                You lost {formatMoney(result.summary.belowCostLoss, currencyCode)}{" "}
                in the last 30 days on these products.
              </s-paragraph>
            </s-banner>
          )}

          <s-section heading="Summary">
            <s-stack direction="inline" gap="large">
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text tone="critical">Below cost</s-text>
                  <s-heading>{result.summary.belowCostCount}</s-heading>
                  <s-text color="subdued">
                    {formatMoney(result.summary.belowCostLoss, currencyCode)} lost
                    (30d)
                  </s-text>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text tone="warning">Below margin threshold</s-text>
                  <s-heading>{result.summary.lowMarginCount}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="small">
                  <s-text color="subdued">No cost recorded</s-text>
                  <s-heading>{result.summary.noCostCount}</s-heading>
                </s-stack>
              </s-box>
            </s-stack>
          </s-section>

          <s-section heading={`Worst ${worstRows.length} margins`}>
            <s-table>
              <s-table-header-row>
                <s-table-header>Product</s-table-header>
                <s-table-header>Variant</s-table-header>
                <s-table-header>SKU</s-table-header>
                <s-table-header format="currency">Cost</s-table-header>
                <s-table-header format="currency">Price</s-table-header>
                <s-table-header format="numeric">Margin %</s-table-header>
                <s-table-header format="numeric">Sold (30d)</s-table-header>
                <s-table-header>Flag</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {worstRows.map((row) => (
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
                      <s-badge tone={FLAG_TONE[row.flag]}>
                        {FLAG_LABEL[row.flag]}
                      </s-badge>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
