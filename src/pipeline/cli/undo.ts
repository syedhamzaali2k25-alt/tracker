// CLI entry point for `npm run undo`. See diagnostic.ts for why this lives
// in its own never-imported file, and preview.ts for why it can no longer
// do the whole job by itself — push batches now live in the app's database
// (app/app/push-batches.server.ts), not the filesystem, and this script has
// no database connection to read them from. Use the app's History page
// instead.

console.error(
  "npm run undo no longer works from the CLI: push history moved from ./backups/ to the app's " +
    'database, viewable/undoable on its "History" page. Run the app (`cd app && npm run dev`) ' +
    "and undo from there.",
);
process.exitCode = 1;
