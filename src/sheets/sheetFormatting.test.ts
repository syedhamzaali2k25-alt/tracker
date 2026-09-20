import assert from "node:assert/strict";
import { test } from "node:test";
import type { sheets_v4 } from "googleapis";
import {
  diagnosticFormattingRequests,
  EXACT_LOCATION,
  fixFormattingRequests,
  setFormatVersionRequest,
} from "./sheetFormatting.js";

const SHEET_ID = 4242;

// Google's own accepted values for DeveloperMetadataLocationMatchingStrategy
// (https://developers.google.com/workspace/sheets/api/reference/rest/v4/DataFilter) —
// NOT the bare "EXACT"/"INTERSECTING" the field's prose description reads
// as. Sending anything outside this set is exactly the bug that took down
// writeDiagnostic() entirely: request-shape assertions alone (matching
// field names/types) don't catch a wrong-but-plausible-looking string
// value, since TypeScript types this field as a bare `string`.
const VALID_LOCATION_MATCHING_STRATEGIES = [
  "DEVELOPER_METADATA_LOCATION_MATCHING_STRATEGY_UNSPECIFIED",
  "EXACT_LOCATION",
  "INTERSECTING_LOCATION",
];

function repeatCellRequests(requests: sheets_v4.Schema$Request[]) {
  return requests.map((r) => r.repeatCell).filter((r): r is NonNullable<typeof r> => r !== undefined);
}

function find<K extends keyof sheets_v4.Schema$Request>(
  requests: sheets_v4.Schema$Request[],
  key: K,
): NonNullable<sheets_v4.Schema$Request[K]>[] {
  return requests
    .map((r) => r[key])
    .filter((r): r is NonNullable<sheets_v4.Schema$Request[K]> => r !== undefined);
}

test("diagnostic: every range-bearing request targets the given sheetId", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  for (const r of repeatCellRequests(requests)) {
    assert.equal(r.range?.sheetId, SHEET_ID);
  }
  for (const r of find(requests, "updateDimensionProperties")) {
    assert.equal(r.range?.sheetId, SHEET_ID);
  }
  for (const r of find(requests, "addConditionalFormatRule")) {
    for (const range of r.rule?.ranges ?? []) {
      assert.equal(range.sheetId, SHEET_ID);
    }
  }
});

test("diagnostic: header row (index 4) is bolded across all 12 columns, with a non-white background", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const bold = repeatCellRequests(requests).find(
    (r) => r.cell?.userEnteredFormat?.textFormat?.bold === true,
  );
  assert.ok(bold, "expected a bold repeatCell request");
  assert.equal(bold!.range?.startRowIndex, 4);
  assert.equal(bold!.range?.endRowIndex, 5);
  assert.equal(bold!.range?.startColumnIndex, 0);
  assert.equal(bold!.range?.endColumnIndex, 12);
  const background = bold!.cell?.userEnteredFormat?.backgroundColor;
  assert.ok(background, "expected the header to have a background color");
  assert.notDeepEqual(background, { red: 1, green: 1, blue: 1 });
});

test("diagnostic: frozen row count covers summary rows + header (5 rows), and the Product column is frozen too", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [freeze] = find(requests, "updateSheetProperties");
  assert.equal(freeze.properties?.gridProperties?.frozenRowCount, 5);
  assert.equal(freeze.properties?.gridProperties?.frozenColumnCount, 1);
});

test("diagnostic: Product column and Shopify ID columns get generous explicit widths", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const widths = find(requests, "updateDimensionProperties");

  const productWidth = widths.find((w) => w.range?.startIndex === 0)?.properties?.pixelSize;
  assert.ok(productWidth && productWidth >= 200, "Product column should have real room, not a cramped default");

  const idWidth = widths.find((w) => w.range?.startIndex === 10 && w.range?.endIndex === 12);
  assert.ok(idWidth, "expected one width request covering both ID columns (10-11)");
});

test("diagnostic: the Shopify ID columns are grouped into a collapsed block", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [group] = find(requests, "addDimensionGroup");
  assert.equal(group.range?.startIndex, 10);
  assert.equal(group.range?.endIndex, 12);
  assert.equal(group.range?.dimension, "COLUMNS");

  const [update] = find(requests, "updateDimensionGroup");
  assert.equal(update.dimensionGroup?.collapsed, true);
  assert.equal(update.dimensionGroup?.range?.startIndex, 10);
  assert.equal(update.dimensionGroup?.range?.endIndex, 12);
});

test("diagnostic: light gray table borders span the header and data range", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [grid] = find(requests, "updateBorders");
  assert.equal(grid.range?.startRowIndex, 4);
  assert.equal(grid.range?.startColumnIndex, 0);
  assert.equal(grid.range?.endColumnIndex, 12);
  assert.ok(grid.innerVertical, "expected inner vertical gridlines");
  assert.ok(grid.innerHorizontal, "expected inner horizontal gridlines");
});

test("diagnostic: currency format applies to Cost, Price, Revenue, Profit columns only", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const currencyRequests = repeatCellRequests(requests).filter(
    (r) => r.cell?.userEnteredFormat?.numberFormat?.type === "CURRENCY",
  );
  const columns = currencyRequests.map((r) => r.range?.startColumnIndex).sort();
  assert.deepEqual(columns, [3, 4, 7, 8]);
});

test("diagnostic: currency pattern embeds the shop's currency code", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const currencyRequest = repeatCellRequests(requests).find(
    (r) => r.cell?.userEnteredFormat?.numberFormat?.type === "CURRENCY",
  );
  assert.match(currencyRequest!.cell!.userEnteredFormat!.numberFormat!.pattern!, /PKR/);
});

test("diagnostic: falls back to a plain number pattern when currencyCode is blank", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "");
  const currencyRequest = repeatCellRequests(requests).find(
    (r) => r.cell?.userEnteredFormat?.numberFormat?.type === "CURRENCY",
  );
  assert.equal(currencyRequest!.cell!.userEnteredFormat!.numberFormat!.pattern, "#,##0.00");
});

test("diagnostic: percent format applies only to the Margin % column (index 5)", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const percentRequests = repeatCellRequests(requests).filter(
    (r) => r.cell?.userEnteredFormat?.numberFormat?.type === "PERCENT",
  );
  assert.equal(percentRequests.length, 1);
  assert.equal(percentRequests[0].range?.startColumnIndex, 5);
});

test("diagnostic: below-cost conditional format references the Margin % column and a negative threshold", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [rule] = find(requests, "addConditionalFormatRule");
  const formula = rule.rule?.booleanRule?.condition?.values?.[0].userEnteredValue ?? "";
  assert.match(formula, /\$F6/); // column F = index 5, data starts row 6 (1-indexed)
  assert.match(formula, /<0/);
  assert.equal(rule.rule?.ranges?.[0].startColumnIndex, 0);
  assert.equal(rule.rule?.ranges?.[0].endColumnIndex, 12);
});

test("diagnostic: below-cost rows are bolded in addition to the existing red background", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [rule] = find(requests, "addConditionalFormatRule");
  assert.equal(rule.rule?.booleanRule?.format?.backgroundColor?.red, 0.957);
  assert.equal(rule.rule?.booleanRule?.format?.textFormat?.bold, true);
});

test("fix: editable background covers exactly New Price, New Cost, and New Title (columns 5-7)", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  // The header row now also carries a backgroundColor (its own contrast
  // color, not yellow) — find the yellow one specifically rather than
  // grabbing whichever repeatCell with a background happens to come first.
  const [background] = repeatCellRequests(requests).filter(
    (r) => r.cell?.userEnteredFormat?.backgroundColor?.red === 1 && r.cell?.userEnteredFormat?.backgroundColor?.green === 0.949,
  );
  assert.ok(background, "expected a yellow-background repeatCell request");
  assert.equal(background.range?.startColumnIndex, 5);
  assert.equal(background.range?.endColumnIndex, 8);
});

test("fix: header row is bold with a non-white background, and both the header row and Product column are frozen", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const bold = repeatCellRequests(requests).find((r) => r.cell?.userEnteredFormat?.textFormat?.bold === true);
  assert.ok(bold, "expected a bold repeatCell request for the Fix tab header");
  assert.equal(bold!.range?.startRowIndex, 0);
  assert.equal(bold!.range?.endRowIndex, 1);
  assert.equal(bold!.range?.startColumnIndex, 0);
  assert.equal(bold!.range?.endColumnIndex, 11);
  const background = bold!.cell?.userEnteredFormat?.backgroundColor;
  assert.ok(background, "expected the header to have a background color");
  assert.notDeepEqual(background, { red: 1, green: 1, blue: 1 });

  const [freeze] = find(requests, "updateSheetProperties");
  assert.equal(freeze.properties?.gridProperties?.frozenRowCount, 1);
  assert.equal(freeze.properties?.gridProperties?.frozenColumnCount, 1);
});

test("fix: New Title and Product get generous explicit widths, and the ID columns share one width", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const widths = find(requests, "updateDimensionProperties");

  const productWidth = widths.find((w) => w.range?.startIndex === 0)?.properties?.pixelSize;
  const newTitleWidth = widths.find((w) => w.range?.startIndex === 7)?.properties?.pixelSize;
  assert.ok(productWidth && productWidth >= 200, "Product column should have real room, not a cramped default");
  assert.ok(newTitleWidth && newTitleWidth >= 200, "New Title column should have real room for long product names");

  const idWidth = widths.find((w) => w.range?.startIndex === 8 && w.range?.endIndex === 11);
  assert.ok(idWidth, "expected one width request covering all three ID columns (8-10)");
});

test("fix: the Shopify ID columns are grouped into a collapsed block", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const [group] = find(requests, "addDimensionGroup");
  assert.equal(group.range?.startIndex, 8);
  assert.equal(group.range?.endIndex, 11);
  assert.equal(group.range?.dimension, "COLUMNS");

  const [update] = find(requests, "updateDimensionGroup");
  assert.equal(update.dimensionGroup?.collapsed, true);
  assert.equal(update.dimensionGroup?.range?.startIndex, 8);
  assert.equal(update.dimensionGroup?.range?.endIndex, 11);
});

test("fix: table-wide borders are added, plus a heavier separator on both edges of the editable block", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const borders = find(requests, "updateBorders");

  const grid = borders.find((b) => b.range?.startColumnIndex === 0 && b.range?.endColumnIndex === 11);
  assert.ok(grid, "expected a table-wide grid border request");
  assert.ok(grid!.innerVertical, "expected inner vertical gridlines");
  assert.ok(grid!.innerHorizontal, "expected inner horizontal gridlines");

  const leftEdge = borders.find((b) => b.range?.startColumnIndex === 5 && b.range?.endColumnIndex === 6);
  const rightEdge = borders.find((b) => b.range?.startColumnIndex === 8 && b.range?.endColumnIndex === 9);
  assert.ok(leftEdge?.left, "expected a separator border on the left edge of New Price (start of editable block)");
  assert.ok(rightEdge?.left, "expected a separator border on the left edge of Shopify Product ID (end of editable block)");
});

test("fix: protected range covers exactly the three ID columns (8-10) and is warning-only", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const [protectedRange] = find(requests, "addProtectedRange");
  assert.equal(protectedRange.protectedRange?.range?.startColumnIndex, 8);
  assert.equal(protectedRange.protectedRange?.range?.endColumnIndex, 11);
  assert.equal(protectedRange.protectedRange?.warningOnly, true);
  assert.equal(protectedRange.protectedRange?.editors, undefined);
});

test("fix: data validation applies to New Price and New Cost only — New Title is free text", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const validations = find(requests, "setDataValidation");
  const columns = validations.map((v) => v.range?.startColumnIndex).sort();
  assert.deepEqual(columns, [5, 6]);
  for (const v of validations) {
    assert.equal(v.rule?.strict, true);
    assert.equal(v.rule?.condition?.type, "CUSTOM_FORMULA");
  }
});

test("fix: below-cost conditional format targets only New Price and compares it against Current Cost", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const [rule] = find(requests, "addConditionalFormatRule");
  assert.equal(rule.rule?.ranges?.[0].startColumnIndex, 5);
  assert.equal(rule.rule?.ranges?.[0].endColumnIndex, 6);
  const formula = rule.rule?.booleanRule?.condition?.values?.[0].userEnteredValue ?? "";
  assert.match(formula, /\$F2/); // New Price, row 2 (1-indexed, first data row)
  assert.match(formula, /\$E2/); // Current Cost
  assert.match(formula, /\$F2<\$E2/);
});

test("EXACT_LOCATION is a value the Sheets API actually accepts for locationMatchingStrategy", () => {
  assert.ok(
    VALID_LOCATION_MATCHING_STRATEGIES.includes(EXACT_LOCATION),
    `"${EXACT_LOCATION}" is not one of the API's accepted DeveloperMetadataLocationMatchingStrategy values: ${VALID_LOCATION_MATCHING_STRATEGIES.join(", ")}`,
  );
});

test("EXACT_LOCATION is not the bare 'EXACT' that previously broke every developerMetadata call", () => {
  // Regression guard for the exact string Google's error named as invalid.
  assert.notEqual(EXACT_LOCATION, "EXACT");
});

test("setFormatVersionRequest's update path (previously-applied version exists) sends a valid locationMatchingStrategy", () => {
  const request = setFormatVersionRequest(SHEET_ID, "v2", "v1");
  const strategy = request.updateDeveloperMetadata?.dataFilters?.[0].developerMetadataLookup?.locationMatchingStrategy;
  assert.ok(strategy, "expected a locationMatchingStrategy on the update path's data filter");
  assert.ok(
    VALID_LOCATION_MATCHING_STRATEGIES.includes(strategy!),
    `"${strategy}" is not one of the API's accepted DeveloperMetadataLocationMatchingStrategy values`,
  );
});

test("setFormatVersionRequest's create path (no previous version) needs no locationMatchingStrategy at all", () => {
  const request = setFormatVersionRequest(SHEET_ID, "v1", null);
  assert.ok(request.createDeveloperMetadata, "expected a createDeveloperMetadata request when nothing was applied yet");
  assert.equal(request.updateDeveloperMetadata, undefined);
});
