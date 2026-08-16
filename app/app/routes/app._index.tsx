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

function formatMoney(amount: number, currencyCode: string): string {
  return currencyCode ? `${currencyCode} ${amount.toFixed(2)}` : amount.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
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
                        <s-text tone="critical">
                          {formatMoney(
                            Math.abs(row.profit30d!),
                            row.currencyCode || currencyCode,
                          )}
                        </s-text>
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
                        {formatMoney(row.profit30d!, row.currencyCode || currencyCode)}
                      </s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
