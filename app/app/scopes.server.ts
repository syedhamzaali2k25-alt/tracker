// The single source of truth for this app's access scopes is
// shopify.app.toml's [access_scopes] — that's what `shopify app deploy`
// registers with Shopify. shopify.server.ts previously read
// `process.env.SCOPES`, but nothing in this repo (or the CLI, in this
// environment) ever sets a SCOPES env var, so every OAuth grant requested
// zero scopes and Shopify returned a token that can't read or write
// anything. Keep this list in sync with shopify.app.toml by hand — there's
// no TOML parser in this project's dependencies to read it at runtime.
export const SCOPES = [
  "read_products",
  "read_orders",
  "read_inventory",
  "write_products",
  "write_inventory",
];
