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

test("diagnostic: header row (index 4) is bolded across all 12 columns", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const bold = repeatCellRequests(requests).find(
    (r) => r.cell?.userEnteredFormat?.textFormat?.bold === true,
  );
  assert.ok(bold, "expected a bold repeatCell request");
  assert.equal(bold!.range?.startRowIndex, 4);
  assert.equal(bold!.range?.endRowIndex, 5);
  assert.equal(bold!.range?.startColumnIndex, 0);
  assert.equal(bold!.range?.endColumnIndex, 12);
});

test("diagnostic: frozen row count covers summary rows + header (5 rows)", () => {
  const requests = diagnosticFormattingRequests(SHEET_ID, "PKR");
  const [freeze] = find(requests, "updateSheetProperties");
  assert.equal(freeze.properties?.gridProperties?.frozenRowCount, 5);
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

test("fix: editable background covers exactly New Price and New Cost (columns 5-6)", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const [background] = repeatCellRequests(requests).filter(
    (r) => r.cell?.userEnteredFormat?.backgroundColor !== undefined,
  );
  assert.equal(background.range?.startColumnIndex, 5);
  assert.equal(background.range?.endColumnIndex, 7);
});

test("fix: protected range covers exactly the three ID columns (7-9) and is warning-only", () => {
  const requests = fixFormattingRequests(SHEET_ID);
  const [protectedRange] = find(requests, "addProtectedRange");
  assert.equal(protectedRange.protectedRange?.range?.startColumnIndex, 7);
  assert.equal(protectedRange.protectedRange?.range?.endColumnIndex, 10);
  assert.equal(protectedRange.protectedRange?.warningOnly, true);
  assert.equal(protectedRange.protectedRange?.editors, undefined);
});

test("fix: data validation applies to New Price and New Cost, each rejecting non-numeric strict input", () => {
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
