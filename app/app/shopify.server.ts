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
 * Real merchants must be charged for real; only a local/non-production
 * deploy (or an explicit override, for a one-off test on a production
 * deploy) should ever create a Shopify test charge. Test shops and demo
 * stores can't be charged regardless, but production traffic still
 * shouldn't default to isTest just because a real store happens to be new.
 */
export const BILLING_IS_TEST =
  process.env.SHOPIFY_BILLING_TEST_MODE !== undefined
    ? process.env.SHOPIFY_BILLING_TEST_MODE === "true"
    : process.env.NODE_ENV !== "production";

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
