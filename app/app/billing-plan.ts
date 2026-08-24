// Plain constants, deliberately not a .server.ts file: components render
// these directly (plan name, price, trial length), so they need to be safe
// for the client bundle. shopify.server.ts imports these for its billing
// config instead of declaring its own copies.
export const SUBSCRIPTION_PLAN = "Margin Tracker";
export const SUBSCRIPTION_PRICE = 15;
export const SUBSCRIPTION_TRIAL_DAYS = 14;
