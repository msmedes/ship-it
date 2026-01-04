#!/usr/bin/env bun
import { render } from "ink";
import { App } from "./App.js";
import { parseArgs, validateNonInteractiveOptions } from "./lib/cli.js";
import { runNonInteractive } from "./lib/runner.js";

const options = parseArgs(process.argv.slice(2));

if (options.interactive) {
  // Interactive TUI mode
  render(<App mode={options.mode} />);
} else {
  // Non-interactive CLI mode
  const errors = validateNonInteractiveOptions(options);

  if (errors.length > 0) {
    console.error("Error: Missing required options\n");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    console.error("\nRun with --help for usage information.");
    process.exit(1);
  }

  runNonInteractive(options).catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
