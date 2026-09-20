import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";
import { SUBSCRIPTION_PLAN, SUBSCRIPTION_PRICE, SUBSCRIPTION_TRIAL_DAYS } from "./billing-plan";
import { EncryptingSessionStorage } from "./encrypted-session-storage.server";
import { SCOPES } from "./scopes.server";

/**
 * Whether every Shopify billing call creates a test charge (never bills a
 * card) instead of a real one. Deliberately not keyed off NODE_ENV: the
 * Dockerfile hardcodes NODE_ENV=production for every deploy (see
 * README "Deploying"), so a Railway service spun up purely for testing is
 * just as "production" as the real one by that signal alone — trusting it
 * here would mean dev/test deploys create real charges by default, which is
 * the one failure mode billing code can't afford. Test mode is therefore
 * the default; only an explicit SHOPIFY_BILLING_TEST_MODE=false — set on
 * the one deploy that's actually the real production app — turns on real
 * charges.
 */
export const BILLING_IS_TEST = process.env.SHOPIFY_BILLING_TEST_MODE !== "false";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: SCOPES,
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new EncryptingSessionStorage(new PrismaSessionStorage(prisma)),
  distribution: AppDistribution.AppStore,
  billing: {
    [SUBSCRIPTION_PLAN]: {
      trialDays: SUBSCRIPTION_TRIAL_DAYS,
      lineItems: [
        {
          amount: SUBSCRIPTION_PRICE,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
