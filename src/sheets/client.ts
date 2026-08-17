import { google, sheets_v4 } from "googleapis";
import type { GoogleAuthClient } from "./googleAuth.js";

/**
 * Every Sheets-facing function takes this explicitly, the same pattern as
 * ShopContext for Shopify — there's no global "the current spreadsheet."
 * `auth` is per-merchant (built from their stored OAuth refresh token);
 * `spreadsheetId` is the sheet the app created in that merchant's own Drive.
 */
export interface GoogleContext {
  auth: GoogleAuthClient;
  spreadsheetId: string;
}

function getSheetsClient(auth: GoogleAuthClient): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth });
}

/** Creates a new spreadsheet in whichever Drive `auth` belongs to and returns its ID. */
export async function createSpreadsheet(auth: GoogleAuthClient, title: string): Promise<string> {
  const sheets = getSheetsClient(auth);
  const response = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
  });
  const spreadsheetId = response.data.spreadsheetId;
  if (!spreadsheetId) {
    throw new Error("Google did not return an ID for the spreadsheet it just created.");
  }
  return spreadsheetId;
}

export async function ensureTab(ctx: GoogleContext, title: string): Promise<void> {
  const sheets = getSheetsClient(ctx.auth);
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: ctx.spreadsheetId });
  const exists = spreadsheet.data.sheets?.some((s) => s.properties?.title === title);

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ctx.spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }],
      },
    });
  }
}

export async function writeRange(
  ctx: GoogleContext,
  range: string,
  values: unknown[][],
): Promise<void> {
  const sheets = getSheetsClient(ctx.auth);
  await sheets.spreadsheets.values.update({
    spreadsheetId: ctx.spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

export async function clearRange(ctx: GoogleContext, range: string): Promise<void> {
  const sheets = getSheetsClient(ctx.auth);
  await sheets.spreadsheets.values.clear({
    spreadsheetId: ctx.spreadsheetId,
    range,
  });
}

export async function readRange(ctx: GoogleContext, range: string): Promise<string[][]> {
  const sheets = getSheetsClient(ctx.auth);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: ctx.spreadsheetId,
    range,
  });
  return (response.data.values as string[][] | undefined) ?? [];
}
