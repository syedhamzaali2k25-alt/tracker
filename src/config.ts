import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  shopify: {
    shop: required("SHOPIFY_SHOP"),
    accessToken: required("SHOPIFY_ACCESS_TOKEN"),
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2024-10",
  },
  google: {
    serviceAccountEmail: required("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
    privateKey: required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"),
    sheetId: required("GOOGLE_SHEET_ID"),
  },
  lookbackDays: Number(process.env.LOOKBACK_DAYS ?? 30),
  lowMarginThreshold: Number(process.env.LOW_MARGIN_THRESHOLD ?? 0.2),
};
