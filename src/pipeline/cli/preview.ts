// CLI entry point for `npm run preview`. See diagnostic.ts for why this
// lives in its own never-imported file instead of a guarded main() inside
// previewChanges.ts.
import { buildPreviewFromSheet, printPreview } from "../previewChanges.js";

async function main() {
  const preview = await buildPreviewFromSheet((message) => console.log(message));
  printPreview(preview);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
