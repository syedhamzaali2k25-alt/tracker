import type { MarginChange, WeeklyDiffResult } from "./weeklyDiff.js";

export interface WeeklyAlertEmail {
  subject: string;
  text: string;
  html: string;
}

function formatMoney(amount: number, currencyCode: string): string {
  return currencyCode ? `${currencyCode} ${amount.toFixed(2)}` : amount.toFixed(2);
}

function describeRow(change: MarginChange, fallbackCurrencyCode: string): string {
  const { row } = change;
  const currencyCode = row.currencyCode || fallbackCurrencyCode;
  const margin = row.marginPct === null ? "N/A" : `${(row.marginPct * 100).toFixed(1)}%`;
  const cost = row.cost === null ? "N/A" : formatMoney(row.cost, currencyCode);
  const name = [row.productTitle, row.variantTitle].filter(Boolean).join(" ");
  const sku = row.sku ? ` (SKU ${row.sku})` : "";
  return `${name}${sku}: price ${formatMoney(row.price, currencyCode)}, cost ${cost}, margin ${margin}`;
}

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (ch) => escapes[ch]);
}

/**
 * Plain text + HTML for the weekly watchman alert. Pure and unaware of how
 * it gets sent — app/app/email.server.ts owns the actual delivery.
 */
export function buildWeeklyAlertEmail(
  shop: string,
  diff: WeeklyDiffResult,
  currencyCode: string,
): WeeklyAlertEmail {
  const total = diff.newlyBelowCost.length + diff.newlyLowMargin.length;
  const subject = `Margin Tracker: ${total} product${total === 1 ? "" : "s"} newly flagged on ${shop}`;

  const textSections: string[] = [];
  const htmlSections: string[] = [];

  if (diff.newlyBelowCost.length > 0) {
    textSections.push(
      `Newly selling below cost (${diff.newlyBelowCost.length}):\n` +
        diff.newlyBelowCost.map((c) => `  - ${describeRow(c, currencyCode)}`).join("\n"),
    );
    htmlSections.push(
      `<h2>Newly selling below cost (${diff.newlyBelowCost.length})</h2><ul>` +
        diff.newlyBelowCost.map((c) => `<li>${escapeHtml(describeRow(c, currencyCode))}</li>`).join("") +
        `</ul>`,
    );
  }

  if (diff.newlyLowMargin.length > 0) {
    textSections.push(
      `Newly below the margin threshold (${diff.newlyLowMargin.length}):\n` +
        diff.newlyLowMargin.map((c) => `  - ${describeRow(c, currencyCode)}`).join("\n"),
    );
    htmlSections.push(
      `<h2>Newly below the margin threshold (${diff.newlyLowMargin.length})</h2><ul>` +
        diff.newlyLowMargin.map((c) => `<li>${escapeHtml(describeRow(c, currencyCode))}</li>`).join("") +
        `</ul>`,
    );
  }

  const intro =
    `Margin Tracker found ${total} product${total === 1 ? "" : "s"} on ${shop} that crossed into ` +
    `a bad margin state since last week's check.`;
  const outro = "Open the app to review and push a fix. You can turn these emails off from Settings.";

  const text = `${intro}\n\n${textSections.join("\n\n")}\n\n${outro}`;
  const html =
    `<p>${escapeHtml(intro)}</p>${htmlSections.join("")}<p>${escapeHtml(outro)}</p>`;

  return { subject, text, html };
}
