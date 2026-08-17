// CLI entry point for `npm run preview`. See diagnostic.ts for why this
// lives in its own never-imported file, and for why it can no longer talk to
// Google Sheets: reading the Fix tab needs a per-merchant OAuth-authorized
// GoogleContext (see app/app/google-auth.server.ts), and this script has no
// browser to complete that flow with. Use the app instead.

console.error(
  "npm run preview no longer works from the CLI: the Fix tab now lives in a Google Sheet " +
    "connected via per-merchant OAuth, which requires a browser to authorize. Run the app " +
    "(`cd app && npm run dev`) and use its \"Push changes\" button instead — it previews the " +
    "same way before asking you to confirm.",
);
process.exitCode = 1;
