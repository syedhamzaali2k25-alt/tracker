// CLI entry point for `npm run apply`. See diagnostic.ts for why this lives
// in its own never-imported file, and preview.ts for why it can no longer
// talk to Google Sheets — reading the Fix tab needs a per-merchant
// OAuth-authorized GoogleContext (see app/app/google-auth.server.ts), which
// this script has no browser to obtain. Use the app instead.

console.error(
  "npm run apply no longer works from the CLI: the Fix tab now lives in a Google Sheet " +
    "connected via per-merchant OAuth, which requires a browser to authorize. Run the app " +
    "(`cd app && npm run dev`) and use its \"Push changes\" button instead.",
);
process.exitCode = 1;
