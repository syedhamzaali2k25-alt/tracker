// CLI entry point for `npm run undo`. See diagnostic.ts for why this lives
// in its own never-imported file. Push batches used to live as JSON files in
// ./backups/ that this script could read directly; they're now stored per
// shop in the app's database (app/app/push-batch.server.ts) alongside each
// batch's reverted flag, which needs the same per-merchant session the app
// already has to look up. Use the app instead.

console.error(
  "npm run undo no longer works from the CLI: push batches are now stored per shop in the " +
    "app's database, not ./backups/ on this machine. Run the app (`cd app && npm run dev`) " +
    "and use the History page's Undo button instead.",
);
process.exitCode = 1;
