import db from "./db.server";
import { decrypt, encrypt } from "./crypto.server";

export interface GoogleConnection {
  refreshToken: string;
  spreadsheetId: string | null;
}

/** Returns null when the shop has no live Google connection (never connected, or reconnect needed). */
export async function getGoogleConnection(shop: string): Promise<GoogleConnection | null> {
  const row = await db.googleAccount.findUnique({ where: { shop } });
  if (!row || !row.refreshToken) return null;
  return { refreshToken: decrypt(row.refreshToken), spreadsheetId: row.spreadsheetId };
}

export async function saveGoogleRefreshToken(shop: string, refreshToken: string): Promise<void> {
  const encrypted = encrypt(refreshToken);
  await db.googleAccount.upsert({
    where: { shop },
    create: { shop, refreshToken: encrypted },
    update: { refreshToken: encrypted },
  });
}

export async function saveSpreadsheetId(shop: string, spreadsheetId: string): Promise<void> {
  await db.googleAccount.update({ where: { shop }, data: { spreadsheetId } });
}

/**
 * Clears a revoked/expired refresh token without losing the spreadsheetId
 * link, so reconnecting resumes writing to the same sheet instead of
 * creating a new one. Used when a Google API call fails with invalid_grant.
 */
export async function invalidateGoogleConnection(shop: string): Promise<void> {
  await db.googleAccount.updateMany({ where: { shop }, data: { refreshToken: null } });
}

/** Full removal, used by the shop/redact GDPR webhook and app/uninstalled. */
export async function deleteGoogleConnection(shop: string): Promise<void> {
  await db.googleAccount.deleteMany({ where: { shop } });
}
