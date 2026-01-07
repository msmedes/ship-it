#!/usr/bin/env bun
import { render } from "ink";
import { App } from "./App.js";
import { parseArgs, validateNonInteractiveOptions, printHelp } from "./lib/cli.js";
import { runNonInteractive } from "./lib/runner.js";
import { createPreview, listPreviews, deletePreview } from "./lib/preview.js";

const options = parseArgs(process.argv.slice(2));

async function main() {
  const { command } = options;

  switch (command.type) {
    case "tui":
      render(<App mode={options.mode} />);
      break;

    case "help":
      printHelp();
      break;

    case "preview":
      await handlePreview(command);
      break;

    case "deploy":
      const errors = validateNonInteractiveOptions(options);
      if (errors.length > 0) {
        console.error("Error: Missing required options\n");
        for (const error of errors) {
          console.error(`  - ${error}`);
        }
        console.error("\nRun with --help for usage information.");
        process.exit(1);
      }
      await runNonInteractive(options);
      break;

    case "list-locations":
    case "list-types":
      await runNonInteractive(options);
      break;
  }
}

async function handlePreview(command: { action: string; ref?: string; hash?: string }) {
  const projectPath = process.cwd();

  switch (command.action) {
    case "create":
      await createPreview(projectPath, command.ref);
      break;

    case "list":
      const previews = await listPreviews(projectPath);
      if (previews.length === 0) {
        console.log("No active previews.");
      } else {
        console.log("Active previews:\n");
        for (const p of previews) {
          console.log(`  ${p.hash}  ${p.url}`);
          console.log(`           Created: ${p.createdAt}\n`);
        }
      }
      break;

    case "delete":
      if (!command.hash) {
        console.error("Error: hash required for delete");
        process.exit(1);
      }
      await deletePreview(projectPath, command.hash);
      break;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
