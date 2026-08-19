import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { completeGoogleConnect, shopFromGoogleState } from "../google-auth.server";
import { saveGoogleRefreshToken } from "../google-account.server";

/**
 * Google redirects here directly — there's no Shopify session token on this
 * request (it's a plain top-level navigation from google.com, not an
 * embedded App Bridge fetch), so this route can't call authenticate.admin()
 * the way every other route does. It trusts `state` instead, which was
 * HMAC-signed with the shop it was issued for when the "Connect Google"
 * link was built (see google-auth.server.ts's getGoogleConnectUrl).
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    console.error(`[auth/google/callback] Google redirected back with error=${oauthError}`);
    return redirect(`/app?googleError=${encodeURIComponent(oauthError)}`);
  }

  if (!code) {
    console.error("[auth/google/callback] missing `code` query param");
  }
  if (!state) {
    console.error("[auth/google/callback] missing `state` query param");
  }

  // shopFromGoogleState (verifyState) logs the specific reason — decode
  // failure, wrong shape, HMAC mismatch, or expiry — itself when it returns
  // null; nothing to add here beyond flagging that it did.
  const shop = state ? shopFromGoogleState(state) : null;
  if (state && !shop) {
    console.error("[auth/google/callback] state present but did not verify — see the verifyState log above for why");
  }
  if (!shop || !code) {
    return redirect("/app?googleError=invalid_request");
  }

  try {
    const { refreshToken } = await completeGoogleConnect(code);
    await saveGoogleRefreshToken(shop, refreshToken);
  } catch (error) {
    const gaxiosResponse =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: { data?: unknown; status?: number } }).response
        : undefined;
    console.error(`[auth/google/callback] token exchange failed for shop=${shop}:`, error);
    if (gaxiosResponse) {
      console.error(
        `[auth/google/callback] Google's response: status=${gaxiosResponse.status} data=${JSON.stringify(gaxiosResponse.data)}`,
      );
    }
    return redirect(`/app?shop=${encodeURIComponent(shop)}&googleError=exchange_failed`);
  }

  // Landing back on /app top-level (outside the iframe) re-runs
  // authenticate.admin() in app.tsx's loader, which handles bouncing this
  // navigation back into the embedded Shopify admin context — the same
  // thing that already happens at the end of the Shopify install flow.
  return redirect(`/app?shop=${encodeURIComponent(shop)}&googleConnected=1`);
};
