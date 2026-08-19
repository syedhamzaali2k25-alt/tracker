import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
  googleClientFromRefreshToken,
  isGoogleReauthError,
  signState,
  verifyState,
  type GoogleAuthClient,
  type GoogleOAuthConfig,
} from "~lib/sheets/googleAuth.js";

export type { GoogleAuthClient };
export { isGoogleReauthError };

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function oauthConfig(): GoogleOAuthConfig {
  const appUrl = requiredEnv("SHOPIFY_APP_URL").replace(/\/$/, "");
  const redirectUri = `${appUrl}/auth/google/callback`;
  // Compare this byte-for-byte against the redirect URI registered on the
  // Google Cloud OAuth client — any mismatch (trailing slash, http vs
  // https, wrong domain) makes Google reject the exchange with
  // redirect_uri_mismatch.
  console.log(`[google-auth] redirect_uri=${redirectUri} (from SHOPIFY_APP_URL=${appUrl})`);
  return {
    clientId: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri,
  };
}

// Signing the OAuth state needs a secret only this server knows; reusing
// SESSION_ENCRYPTION_KEY avoids introducing yet another required env var
// purely for this. It's never used for encryption here, just as an HMAC key.
function stateSecret(): string {
  return requiredEnv("SESSION_ENCRYPTION_KEY");
}

export function getGoogleConnectUrl(shop: string): string {
  return buildGoogleAuthUrl(oauthConfig(), signState(stateSecret(), shop));
}

/** Returns the shop that requested this OAuth flow, or null if `state` is missing/invalid/expired. */
export function shopFromGoogleState(state: string): string | null {
  return verifyState(stateSecret(), state);
}

export async function completeGoogleConnect(code: string): Promise<{ refreshToken: string }> {
  return exchangeGoogleAuthCode(oauthConfig(), code);
}

export function googleAuthClientFromRefreshToken(refreshToken: string): GoogleAuthClient {
  return googleClientFromRefreshToken(oauthConfig(), refreshToken);
}
