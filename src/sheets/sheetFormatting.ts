import type { sheets_v4 } from "googleapis";
import { getSheetsClient, type GoogleContext } from "./client.js";

// A generous but bounded row count for range-based requests (matches the
// clearRange bound already used when rewriting values) — Sheets requests
// need a concrete endRowIndex, not "to the end."
const MAX_ROW = 10000;

const LIGHT_RED = { red: 0.957, green: 0.8, blue: 0.8 };
const LIGHT_YELLOW = { red: 1, green: 0.949, blue: 0.8 };
// A muted blue-gray, not pure white, so the header row reads as a header
// even before its bold text registers.
const HEADER_BACKGROUND = { red: 0.851, green: 0.882, blue: 0.949 };
const GRID_BORDER: sheets_v4.Schema$Border = {
  style: "SOLID",
  color: { red: 0.8, green: 0.8, blue: 0.8 },
};
// A visibly heavier border than the light grid lines, used only at block
// boundaries (e.g. read-only vs editable columns) so it stands out from the
// rest of the table grid.
const SEPARATOR_BORDER: sheets_v4.Schema$Border = {
  style: "SOLID_MEDIUM",
  color: { red: 0.45, green: 0.45, blue: 0.45 },
};

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
const DIAGNOSTIC_FORMAT_VERSION = "diagnostic-v2";
const FIX_FORMAT_VERSION = "fix-v4";

function columnLetter(index: number): string {
  // Only ever called with this project's own small, fixed column indices
  // (well under 26) — no need for the general base-26 case.
  return String.fromCharCode(65 + index);
}

function columnWidthRequest(
  sheetId: number,
  startIndex: number,
  endIndex: number,
  pixelSize: number,
): sheets_v4.Schema$Request {
  return {
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex, endIndex },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  };
}

/**
 * Tucks a range of columns (the raw Shopify ID columns) behind a
 * collapsible [+] group, hidden by default — merchants can still expand it,
 * and the app reads/writes those columns the same either way, since this
 * only changes the sheet's default visual state.
 */
function collapsedColumnGroupRequests(
  sheetId: number,
  startIndex: number,
  endIndex: number,
): sheets_v4.Schema$Request[] {
  const range: sheets_v4.Schema$DimensionRange = { sheetId, dimension: "COLUMNS", startIndex, endIndex };
  return [
    { addDimensionGroup: { range } },
    // depth must be present and > 0 even though fields only lists
    // "collapsed" — the API uses (range, depth) together to identify which
    // group to update. addDimensionGroup above always creates a first-level
    // group, so depth is always 1 here.
    {
      updateDimensionGroup: {
        dimensionGroup: { range, depth: 1, collapsed: true },
        fields: "collapsed",
      },
    },
  ];
}

/** Light gray gridlines across a table's full range, so it reads as a table rather than a wall of text. */
function tableGridBordersRequest(
  sheetId: number,
  startRowIndex: number,
  endColumnIndex: number,
): sheets_v4.Schema$Request {
  return {
    updateBorders: {
      range: { sheetId, startRowIndex, endRowIndex: MAX_ROW, startColumnIndex: 0, endColumnIndex },
      top: GRID_BORDER,
      bottom: GRID_BORDER,
      left: GRID_BORDER,
      right: GRID_BORDER,
      innerHorizontal: GRID_BORDER,
      innerVertical: GRID_BORDER,
    },
  };
}

/**
 * A heavier left border on one column, marking a block boundary (e.g.
 * read-only vs editable columns). Callers send this after
 * tableGridBordersRequest so it wins at that column's edge instead of being
 * overwritten by the lighter table-wide grid.
 */
function columnSeparatorRequest(
  sheetId: number,
  columnIndex: number,
  startRowIndex: number,
): sheets_v4.Schema$Request {
  return {
    updateBorders: {
      range: {
        sheetId,
        startRowIndex,
        endRowIndex: MAX_ROW,
        startColumnIndex: columnIndex,
        endColumnIndex: columnIndex + 1,
      },
      left: SEPARATOR_BORDER,
    },
  };
}

/**
 * A protected range can only be deleted by the numeric protectedRangeId
 * Google assigned it when it was created — not by its range or description
 * — so this is how a stale one (left behind when a format version bump
 * moves the columns it used to cover) gets found again. Matches by
 * description rather than by range/column position, specifically so this
 * can never delete a protection a merchant added themselves: only ranges
 * whose description exactly matches the one this app always sets are
 * touched. Exported for testing — see sheetFormatting.test.ts.
 */
export function staleProtectedRangeDeleteRequests(
  existing: sheets_v4.Schema$ProtectedRange[],
  description: string,
): sheets_v4.Schema$Request[] {
  return existing
    .filter((range) => range.description === description && range.protectedRangeId != null)
    .map((range): sheets_v4.Schema$Request => ({
      deleteProtectedRange: { protectedRangeId: range.protectedRangeId! },
    }));
}

async function removeStaleProtectedRangeRequests(
  ctx: GoogleContext,
  sheetId: number,
  description: string,
): Promise<sheets_v4.Schema$Request[]> {
  const sheets = getSheetsClient(ctx.auth);
  const response = await sheets.spreadsheets.get({
    spreadsheetId: ctx.spreadsheetId,
    fields: "sheets(properties.sheetId,protectedRanges)",
  });
  const sheet = response.data.sheets?.find((s) => s.properties?.sheetId === sheetId);
  return staleProtectedRangeDeleteRequests(sheet?.protectedRanges ?? [], description);
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
  buildRequests: () => sheets_v4.Schema$Request[] | Promise<sheets_v4.Schema$Request[]>,
): Promise<void> {
  const sheets = getSheetsClient(ctx.auth);
  const applied = await getAppliedFormatVersion(sheets, ctx.spreadsheetId, sheetId);
  if (applied === version) return;

  const requests = [...(await buildRequests()), setFormatVersionRequest(sheetId, version, applied)];
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
// productId/variantId are sized separately below (they share one width, and
// are also grouped into a collapsed block).
const DIAGNOSTIC_COLUMN_WIDTHS: [number, number][] = [
  [DIAGNOSTIC_COLUMNS.product, 240],
  [DIAGNOSTIC_COLUMNS.variant, 160],
  [DIAGNOSTIC_COLUMNS.sku, 110],
  [DIAGNOSTIC_COLUMNS.cost, 100],
  [DIAGNOSTIC_COLUMNS.price, 100],
  [DIAGNOSTIC_COLUMNS.marginPct, 100],
  [DIAGNOSTIC_COLUMNS.sold30d, 100],
  [DIAGNOSTIC_COLUMNS.revenue30d, 130],
  [DIAGNOSTIC_COLUMNS.profit30d, 130],
  [DIAGNOSTIC_COLUMNS.flag, 150],
];

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
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEADER_BACKGROUND } },
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: DIAGNOSTIC_DATA_START_ROW, frozenColumnCount: 1 },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
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
    // Sized generously for realistic content (long product titles, full
    // Shopify gids) rather than auto-resize, which has nothing to measure
    // against — this runs before the data write below ever populates the
    // sheet (see writeDiagnostic in diagnosticSheet.ts).
    ...DIAGNOSTIC_COLUMN_WIDTHS.map(([columnIndex, pixelSize]) =>
      columnWidthRequest(sheetId, columnIndex, columnIndex + 1, pixelSize),
    ),
    columnWidthRequest(sheetId, DIAGNOSTIC_COLUMNS.productId, DIAGNOSTIC_COLUMNS.variantId + 1, 240),
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
            // Bold on top of the existing red background — additive, so a
            // below-cost row is unmistakable even at a glance, not just on
            // close reading of the background color.
            format: { backgroundColor: LIGHT_RED, textFormat: { bold: true } },
          },
        },
        index: 0,
      },
    },
    tableGridBordersRequest(sheetId, DIAGNOSTIC_HEADER_ROW, DIAGNOSTIC_COLUMN_COUNT),
    ...collapsedColumnGroupRequests(sheetId, DIAGNOSTIC_COLUMNS.productId, DIAGNOSTIC_COLUMNS.variantId + 1),
  ];
}

// The Diagnostic tab doesn't add any protected range today, so there's
// nothing to clean up here — but if one is ever added, give it its own
// description constant and route it through removeStaleProtectedRangeRequests
// the same way ensureFixFormatting does below, rather than assuming a
// future column shift can't leave the same kind of stale range behind.
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
  product: 0,
  variant: 1,
  sku: 2,
  currentPrice: 3,
  currentCost: 4,
  newPrice: 5,
  newCost: 6,
  newTitle: 7,
  productId: 8,
  variantId: 9,
  inventoryItemId: 10,
} as const;
const FIX_COLUMN_COUNT = 11;
// Shared between the addProtectedRange request below and
// ensureFixFormatting's stale-protection cleanup, so the two can never
// drift out of sync with each other — the cleanup step matches existing
// protected ranges by this exact text.
const FIX_ID_PROTECTION_DESCRIPTION =
  "Shopify IDs, used to match this row back to the right variant. Edit with care.";
// productId/variantId/inventoryItemId are sized separately below (they
// share one width, and are also grouped into a collapsed block).
const FIX_COLUMN_WIDTHS: [number, number][] = [
  [FIX_COLUMNS.product, 240],
  [FIX_COLUMNS.variant, 160],
  [FIX_COLUMNS.sku, 110],
  [FIX_COLUMNS.currentPrice, 100],
  [FIX_COLUMNS.currentCost, 100],
  [FIX_COLUMNS.newPrice, 100],
  [FIX_COLUMNS.newCost, 100],
  // Product-name-length text can land here too, so it gets the same room
  // as the Product column itself.
  [FIX_COLUMNS.newTitle, 240],
];

/** Exported for testing — see sheetFormatting.test.ts. Not meant to be called directly by anything else. */
export function fixFormattingRequests(sheetId: number): sheets_v4.Schema$Request[] {
  const currentPriceLetter = columnLetter(FIX_COLUMNS.currentPrice);
  const newPriceLetter = columnLetter(FIX_COLUMNS.newPrice);
  const currentCostLetter = columnLetter(FIX_COLUMNS.currentCost);
  const anchorRow = FIX_DATA_START_ROW + 1; // 1-indexed for formulas

  return [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: FIX_DATA_START_ROW,
          startColumnIndex: 0,
          endColumnIndex: FIX_COLUMN_COUNT,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: HEADER_BACKGROUND } },
        fields: "userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor",
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: FIX_DATA_START_ROW, frozenColumnCount: 1 },
        },
        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount",
      },
    },
    // Sized generously for realistic content (long product titles, full
    // Shopify gids) rather than auto-resize, which has nothing to measure
    // against — this runs before the data write below ever populates the
    // sheet (see writeDiagnostic in diagnosticSheet.ts).
    ...FIX_COLUMN_WIDTHS.map(([columnIndex, pixelSize]) => columnWidthRequest(sheetId, columnIndex, columnIndex + 1, pixelSize)),
    columnWidthRequest(sheetId, FIX_COLUMNS.productId, FIX_COLUMNS.inventoryItemId + 1, 240),
    // New Price / New Cost / New Title get a distinct background so it's
    // obvious where a merchant is meant to type.
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: FIX_DATA_START_ROW,
          endRowIndex: MAX_ROW,
          startColumnIndex: FIX_COLUMNS.newPrice,
          endColumnIndex: FIX_COLUMNS.newTitle + 1,
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
          description: FIX_ID_PROTECTION_DESCRIPTION,
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
    // Current Price already below Current Cost -> the whole row goes bold
    // red, the same treatment the Diagnostic tab already gives a below-cost
    // row, so a merchant editing straight from this tab notices a product
    // is already selling at a loss before they even touch New Price. Added
    // after the New-Price-specific rule above, so on a row where both
    // conditions are true this one — index 0, topmost — wins and the row
    // reads as bold rather than just plain red.
    {
      addConditionalFormatRule: {
        rule: {
          ranges: [
            {
              sheetId,
              startRowIndex: FIX_DATA_START_ROW,
              endRowIndex: MAX_ROW,
              startColumnIndex: 0,
              endColumnIndex: FIX_COLUMN_COUNT,
            },
          ],
          booleanRule: {
            condition: {
              type: "CUSTOM_FORMULA",
              values: [
                {
                  userEnteredValue:
                    `=AND(ISNUMBER($${currentPriceLetter}${anchorRow}), ISNUMBER($${currentCostLetter}${anchorRow}), ` +
                    `$${currentPriceLetter}${anchorRow}<$${currentCostLetter}${anchorRow})`,
                },
              ],
            },
            format: { backgroundColor: LIGHT_RED, textFormat: { bold: true } },
          },
        },
        index: 0,
      },
    },
    tableGridBordersRequest(sheetId, 0, FIX_COLUMN_COUNT),
    // Heavier borders on both edges of the yellow editable block, so it
    // reads as its own section rather than blending into the read-only
    // columns on either side of it.
    columnSeparatorRequest(sheetId, FIX_COLUMNS.newPrice, 0),
    columnSeparatorRequest(sheetId, FIX_COLUMNS.productId, 0),
    ...collapsedColumnGroupRequests(sheetId, FIX_COLUMNS.productId, FIX_COLUMNS.inventoryItemId + 1),
  ];
}

export async function ensureFixFormatting(ctx: GoogleContext, sheetId: number): Promise<void> {
  await ensureFormatted(ctx, sheetId, FIX_FORMAT_VERSION, async () => {
    // A previous format version's addProtectedRange (built with that
    // version's column indices) is never automatically removed when the
    // columns it covered shift — e.g. adding New Title moved the ID
    // columns from 7-9 to 8-10, leaving a stale protection sitting on New
    // Title and the wrong ID column on any sheet formatted before that
    // change. Delete anything matching this app's own description before
    // adding the fresh one at today's indices, every time this runs.
    const deleteStaleProtections = await removeStaleProtectedRangeRequests(
      ctx,
      sheetId,
      FIX_ID_PROTECTION_DESCRIPTION,
    );
    return [...deleteStaleProtections, ...fixFormattingRequests(sheetId)];
  });
}
