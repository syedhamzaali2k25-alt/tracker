import type { sheets_v4 } from "googleapis";
import { getSheetsClient, type GoogleContext } from "./client.js";

// A generous but bounded row count for range-based requests (matches the
// clearRange bound already used when rewriting values) — Sheets requests
// need a concrete endRowIndex, not "to the end."
const MAX_ROW = 10000;

const LIGHT_RED = { red: 0.957, green: 0.8, blue: 0.8 };
const LIGHT_YELLOW = { red: 1, green: 0.949, blue: 0.8 };

const METADATA_KEY = "marginTrackerFormatVersion";
// DeveloperMetadataLocationMatchingStrategy's real accepted values are
// EXACT_LOCATION / INTERSECTING_LOCATION (not the bare "EXACT"/
// "INTERSECTING" the field's prose description might suggest) — a plain
// "EXACT" here previously made every developerMetadata call fail with
// "Invalid value ... location_matching_strategy", which took down
// writeDiagnostic() entirely since that failure wasn't isolated from the
// actual data write. Single constant so this can't drift out of sync
// between the two call sites again.
export const EXACT_LOCATION = "EXACT_LOCATION";

/**
 * Bump either of these when the requests that version's builder returns
 * change in a way that needs re-applying to sheets that already have an
 * older version's formatting (e.g. a column moves, a new column needs a
 * number format). Sheets whose stored version already matches are skipped
 * — see ensureFormatted.
 */
const DIAGNOSTIC_FORMAT_VERSION = "diagnostic-v1";
const FIX_FORMAT_VERSION = "fix-v1";

function columnLetter(index: number): string {
  // Only ever called with this project's own small, fixed column indices
  // (well under 26) — no need for the general base-26 case.
  return String.fromCharCode(65 + index);
}

async function getAppliedFormatVersion(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
): Promise<string | null> {
  const response = await sheets.spreadsheets.developerMetadata.search({
    spreadsheetId,
    requestBody: {
      dataFilters: [
        {
          developerMetadataLookup: {
            metadataKey: METADATA_KEY,
            metadataLocation: { sheetId },
            locationMatchingStrategy: EXACT_LOCATION,
          },
        },
      ],
    },
  });
  const match = response.data.matchedDeveloperMetadata?.[0]?.developerMetadata;
  return match?.metadataValue ?? null;
}

/** Exported for testing — see sheetFormatting.test.ts. Not meant to be called directly by anything else. */
export function setFormatVersionRequest(
  sheetId: number,
  version: string,
  previouslyApplied: string | null,
): sheets_v4.Schema$Request {
  if (previouslyApplied === null) {
    return {
      createDeveloperMetadata: {
        developerMetadata: {
          metadataKey: METADATA_KEY,
          metadataValue: version,
          location: { sheetId },
          visibility: "DOCUMENT",
        },
      },
    };
  }
  return {
    updateDeveloperMetadata: {
      dataFilters: [
        {
          developerMetadataLookup: {
            metadataKey: METADATA_KEY,
            metadataLocation: { sheetId },
            locationMatchingStrategy: EXACT_LOCATION,
          },
        },
      ],
      developerMetadata: { metadataValue: version },
      fields: "metadataValue",
    },
  };
}

/**
 * Applies `buildRequests()` in one batchUpdate, but only when this sheet's
 * stored format version (tracked via spreadsheet-invisible developer
 * metadata, not a cell anyone can see or accidentally overwrite) doesn't
 * already match `version` — i.e. only on the tab's first-ever format or
 * after a deliberate version bump, never on every plain diagnostic run.
 * The version-check read is one lightweight API call every run; the
 * (much larger) formatting write only happens when it's actually needed.
 */
async function ensureFormatted(
  ctx: GoogleContext,
  sheetId: number,
  version: string,
  buildRequests: () => sheets_v4.Schema$Request[],
): Promise<void> {
  const sheets = getSheetsClient(ctx.auth);
  const applied = await getAppliedFormatVersion(sheets, ctx.spreadsheetId, sheetId);
  if (applied === version) return;

  const requests = [...buildRequests(), setFormatVersionRequest(sheetId, version, applied)];
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ctx.spreadsheetId,
    requestBody: { requests },
  });
}

// Diagnostic tab layout: 4 summary rows (see summaryRows() in
// diagnosticSheet.ts), then the header, then data. Column order matches
// DIAGNOSTIC_HEADER exactly.
const DIAGNOSTIC_HEADER_ROW = 4;
const DIAGNOSTIC_DATA_START_ROW = 5;
const DIAGNOSTIC_COLUMNS = {
  product: 0,
  variant: 1,
  sku: 2,
  cost: 3,
  price: 4,
  marginPct: 5,
  sold30d: 6,
  revenue30d: 7,
  profit30d: 8,
  flag: 9,
  productId: 10,
  variantId: 11,
} as const;
const DIAGNOSTIC_COLUMN_COUNT = 12;

/** Exported for testing — see sheetFormatting.test.ts. Not meant to be called directly by anything else. */
export function diagnosticFormattingRequests(
  sheetId: number,
  currencyCode: string,
): sheets_v4.Schema$Request[] {
  // A literal ISO code suffix ("PKR", "USD", ...) rather than a symbol
  // table — unambiguous for any currency, and matches this app's own
  // formatMoney() display convention elsewhere (currency code before the
  // amount).
  const currencyPattern = currencyCode ? `"${currencyCode} "#,##0.00` : "#,##0.00";
  const currencyColumns = [
    DIAGNOSTIC_COLUMNS.cost,
    DIAGNOSTIC_COLUMNS.price,
    DIAGNOSTIC_COLUMNS.revenue30d,
    DIAGNOSTIC_COLUMNS.profit30d,
  ];
  const marginColumnLetter = columnLetter(DIAGNOSTIC_COLUMNS.marginPct);
  const marginAnchorRow = DIAGNOSTIC_DATA_START_ROW + 1; // 1-indexed for the formula

  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: DIAGNOSTIC_HEADER_ROW,
          endRowIndex: DIAGNOSTIC_HEADER_ROW + 1,
          startColumnIndex: 0,
          endColumnIndex: DIAGNOSTIC_COLUMN_COUNT,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: DIAGNOSTIC_DATA_START_ROW } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    ...currencyColumns.map(
      (columnIndex): sheets_v4.Schema$Request => ({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: DIAGNOSTIC_DATA_START_ROW,
            endRowIndex: MAX_ROW,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: currencyPattern } } },
          fields: "userEnteredFormat.numberFormat",
        },
      }),
    ),
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: DIAGNOSTIC_DATA_START_ROW,
          endRowIndex: MAX_ROW,
          startColumnIndex: DIAGNOSTIC_COLUMNS.marginPct,
          endColumnIndex: DIAGNOSTIC_COLUMNS.marginPct + 1,
        },
        cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: DIAGNOSTIC_COLUMNS.product, endIndex: DIAGNOSTIC_COLUMNS.product + 1 },
        properties: { pixelSize: 240 },
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: DIAGNOSTIC_COLUMNS.variant, endIndex: DIAGNOSTIC_COLUMNS.variant + 1 },
        properties: { pixelSize: 160 },
        fields: "pixelSize",
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: DIAGNOSTIC_COLUMNS.productId, endIndex: DIAGNOSTIC_COLUMNS.variantId + 1 },
        properties: { pixelSize: 220 },
        fields: "pixelSize",
      },
    },
    // Below-cost rows get a light red background. A conditional format
    // rule, not per-row cell formatting, so it stays correct as data
    // changes on every future sync without ever needing to be reapplied.
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: DIAGNOSTIC_DATA_START_ROW,
              endRowIndex: MAX_ROW,
              startColumnIndex: 0,
              endColumnIndex: DIAGNOSTIC_COLUMN_COUNT,
            },
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [
                {
                  userEnteredValue: `=AND(ISNUMBER($${marginColumnLetter}${marginAnchorRow}), $${marginColumnLetter}${marginAnchorRow}<0)`,
                },
              ],
            },
            format: { backgroundColor: LIGHT_RED },
          },
        },
        index: 0,
      },
    },
  ];
}

export async function ensureDiagnosticFormatting(
  ctx: GoogleContext,
  sheetId: number,
  currencyCode: string,
): Promise<void> {
  await ensureFormatted(ctx, sheetId, DIAGNOSTIC_FORMAT_VERSION, () =>
    diagnosticFormattingRequests(sheetId, currencyCode),
  );
}

// Fix tab layout: header row, then data — no summary block. Column order
// matches FIX_HEADER exactly.
const FIX_DATA_START_ROW = 1;
const FIX_COLUMNS = {
  currentPrice: 3,
  currentCost: 4,
  newPrice: 5,
  newCost: 6,
  productId: 7,
  variantId: 8,
  inventoryItemId: 9,
} as const;

/** Exported for testing — see sheetFormatting.test.ts. Not meant to be called directly by anything else. */
export function fixFormattingRequests(sheetId: number): sheets_v4.Schema$Request[] {
  const newPriceLetter = columnLetter(FIX_COLUMNS.newPrice);
  const currentCostLetter = columnLetter(FIX_COLUMNS.currentCost);
  const anchorRow = FIX_DATA_START_ROW + 1; // 1-indexed for formulas

  return [
    // New Price / New Cost get a distinct background so it's obvious
    // where a merchant is meant to type.
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: FIX_DATA_START_ROW,
          endRowIndex: MAX_ROW,
          startColumnIndex: FIX_COLUMNS.newPrice,
          endColumnIndex: FIX_COLUMNS.newCost + 1,
        },
        cell: { userEnteredFormat: { backgroundColor: LIGHT_YELLOW } },
        fields: "userEnteredFormat.backgroundColor",
      },
    },
    // Warn-only protection on the ID columns: guards against a merchant
    // accidentally typing over or clearing an ID cell. It does NOT stop
    // someone inserting/deleting a row elsewhere and shifting every row
    // below out of alignment with its real variant — that's guarded
    // separately, at read time, by isValidVariantId() in fixSheet.ts
    // (parseFixRow skips any row whose ID no longer looks like a real
    // Shopify variant gid rather than trusting its position). Hard
    // protection (restricted editors) was deliberately avoided: without a
    // reliable way to know the merchant's own Google account email here,
    // getting the editor list wrong would lock them out of their own
    // sheet, which is worse than the accidental-edit risk this guards
    // against.
    {
      addProtectedRange: {
        protectedRange: {
          range: {
            sheetId,
            startRowIndex: FIX_DATA_START_ROW,
            endRowIndex: MAX_ROW,
            startColumnIndex: FIX_COLUMNS.productId,
            endColumnIndex: FIX_COLUMNS.inventoryItemId + 1,
          },
          description: "Shopify IDs — used to match this row back to the right variant. Edit with care.",
          warningOnly: true,
        },
      },
    },
    // Number-only (or blank) validation on New Price / New Cost.
    ...[FIX_COLUMNS.newPrice, FIX_COLUMNS.newCost].map((columnIndex): sheets_v4.Schema$Request => {
      const letter = columnLetter(columnIndex);
      return {
        setDataValidation: {
          range: {
            sheetId,
            startRowIndex: FIX_DATA_START_ROW,
            endRowIndex: MAX_ROW,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          rule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [{ userEnteredValue: `=OR(ISBLANK(${letter}${anchorRow}), ISNUMBER(${letter}${anchorRow}))` }],
            },
            strict: true,
            inputMessage: "Enter a number, or leave blank.",
          },
        },
      };
    }),
    // New Price below this row's Current Cost -> red, so the problem is
    // visible before "Push changes" is even clicked.
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: FIX_DATA_START_ROW,
              endRowIndex: MAX_ROW,
              startColumnIndex: FIX_COLUMNS.newPrice,
              endColumnIndex: FIX_COLUMNS.newPrice + 1,
            },
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [
                {
                  userEnteredValue:
                    `=AND(ISNUMBER($${newPriceLetter}${anchorRow}), ISNUMBER($${currentCostLetter}${anchorRow}), ` +
                    `$${newPriceLetter}${anchorRow}<$${currentCostLetter}${anchorRow})`,
                },
              ],
            },
            format: { backgroundColor: LIGHT_RED },
          },
        },
        index: 0,
      },
    },
  ];
}

export async function ensureFixFormatting(ctx: GoogleContext, sheetId: number): Promise<void> {
  await ensureFormatted(ctx, sheetId, FIX_FORMAT_VERSION, () => fixFormattingRequests(sheetId));
}
