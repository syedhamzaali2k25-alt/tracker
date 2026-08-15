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
    get shop() {
      return required("SHOPIFY_SHOP");
    },
    get accessToken() {
      return required("SHOPIFY_ACCESS_TOKEN");
    },
    get apiVersion() {
      return process.env.SHOPIFY_API_VERSION ?? "2026-07";
    },
  },
  google: {
    get serviceAccountEmail() {
      return required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    },
    get privateKey() {
      return required("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    },
    get sheetId() {
      return required("GOOGLE_SHEET_ID");
    },
  },
  get lookbackDays() {
    return Number(process.env.LOOKBACK_DAYS ?? 30);
  },
  get lowMarginThreshold() {
    return Number(process.env.LOW_MARGIN_THRESHOLD ?? 0.2);
  },
};
