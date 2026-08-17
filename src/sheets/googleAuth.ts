import crypto from "node:crypto";
import { google } from "googleapis";

/**
 * `drive.file` — not the broader `spreadsheets` scope — is deliberate: this
 * app only ever creates the spreadsheet it writes to (see createSpreadsheet
 * below) and never asks a merchant to point it at an existing sheet, so
 * per-file access to files the app itself created is all it needs. It also
 * means a compromised token can't read or touch anything else in the
 * merchant's Drive.
 */
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export type GoogleAuthClient = InstanceType<typeof google.auth.OAuth2>;

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function createGoogleOAuthClient(config: GoogleOAuthConfig): GoogleAuthClient {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const client = createGoogleOAuthClient(config);
  return client.generateAuthUrl({
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if this merchant
    // connected before — without it, a second consent for the same Google
    // account only returns an access_token, and reconnect-after-revoke would
    // silently fail to restore write access.
    prompt: "consent",
    scope: [GOOGLE_DRIVE_FILE_SCOPE],
    state,
  });
}

export async function exchangeGoogleAuthCode(
  config: GoogleOAuthConfig,
  code: string,
): Promise<{ refreshToken: string }> {
  const client = createGoogleOAuthClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. This usually happens when reconnecting without " +
        "first revoking the app's prior access — remove \"Margin Tracker\" from " +
        "https://myaccount.google.com/permissions, then try connecting again.",
    );
  }
  return { refreshToken: tokens.refresh_token };
}

export function googleClientFromRefreshToken(
  config: GoogleOAuthConfig,
  refreshToken: string,
): GoogleAuthClient {
  const client = createGoogleOAuthClient(config);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Google returns this specific error when a refresh token has been revoked
 * or expired — the caller should prompt a reconnect instead of surfacing a
 * generic failure or crashing.
 */
export function isGoogleReauthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { response?: { data?: { error?: string } }; message?: string };
  if (err.response?.data?.error === "invalid_grant") return true;
  return typeof err.message === "string" && err.message.includes("invalid_grant");
}

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * Signs `shop` (plus a timestamp) with HMAC-SHA256 so the OAuth callback —
 * which Google redirects to directly, with no Shopify session on the
 * request — can trust which shop a `code` belongs to without a forgeable
 * plain shop= query param. `secret` should be a value only this server
 * knows (SESSION_ENCRYPTION_KEY).
 */
export function signState(secret: string, shop: string): string {
  const payload = `${shop}:${Date.now()}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`, "utf8").toString("base64url");
}

/** Returns the shop encoded in `state` if the signature is valid and not expired, else null. */
export function verifyState(secret: string, state: string): string | null {
  let decoded: string;
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = decoded.split(":");
  if (parts.length !== 3) return null;
  const [shop, timestamp, signature] = parts;

  const expected = crypto.createHmac("sha256", secret).update(`${shop}:${timestamp}`).digest("hex");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  if (Date.now() - Number(timestamp) > STATE_TTL_MS) return null;

  return shop;
}
