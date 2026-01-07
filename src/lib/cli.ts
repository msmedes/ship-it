export type RunMode = "production" | "dev" | "dry-run";

export type Command =
  | { type: "tui" }
  | { type: "deploy" }
  | { type: "preview"; action: "create" | "list" | "delete"; ref?: string; hash?: string }
  | { type: "list-locations" }
  | { type: "list-types" }
  | { type: "help" };

export interface CliOptions {
  mode: RunMode;
  interactive: boolean;
  command: Command;
  // Non-interactive options
  token?: string;
  serverName?: string;
  location?: string;
  serverType?: string;
  projectName?: string;
  repoUrl?: string;
  // Deprecated - use command instead
  listLocations?: boolean;
  listTypes?: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "production",
    interactive: true,
    command: { type: "tui" },
  };

  // Check for subcommands first
  const firstArg = args[0];
  if (firstArg === "preview") {
    options.interactive = false;
    const action = args[1];
    if (action === "create") {
      options.command = { type: "preview", action: "create", ref: args[2] || "HEAD" };
    } else if (action === "list" || action === "ls") {
      options.command = { type: "preview", action: "list" };
    } else if (action === "delete" || action === "rm") {
      const hash = args[2];
      if (!hash) {
        console.error("Error: preview delete requires a hash");
        console.error("Usage: ship-it preview delete <hash>");
        process.exit(1);
      }
      options.command = { type: "preview", action: "delete", hash };
    } else {
      console.error(`Unknown preview command: ${action}`);
      console.error("Usage: ship-it preview <create|list|delete>");
      process.exit(1);
    }
    return options;
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--dry-run":
        options.mode = "dry-run";
        break;
      case "--dev":
        options.mode = "dev";
        break;
      case "--non-interactive":
      case "-n":
        options.interactive = false;
        options.command = { type: "deploy" };
        break;
      case "--token":
      case "-t":
        options.token = nextArg;
        i++;
        break;
      case "--name":
        options.serverName = nextArg;
        i++;
        break;
      case "--location":
      case "-l":
        options.location = nextArg;
        i++;
        break;
      case "--type":
        options.serverType = nextArg;
        i++;
        break;
      case "--project":
      case "-p":
        options.projectName = nextArg;
        i++;
        break;
      case "--repo":
      case "-r":
        options.repoUrl = nextArg;
        i++;
        break;
      case "--list-locations":
        options.listLocations = true;
        options.interactive = false;
        options.command = { type: "list-locations" };
        break;
      case "--list-types":
        options.listTypes = true;
        options.interactive = false;
        options.command = { type: "list-types" };
        break;
      case "--help":
      case "-h":
        options.command = { type: "help" };
        options.interactive = false;
        break;
    }
  }

  return options;
}

export function validateNonInteractiveOptions(options: CliOptions): string[] {
  const errors: string[] = [];

  // Info commands don't need validation
  if (options.listLocations || options.listTypes) {
    return errors;
  }

  if (!options.interactive) {
    // Token not required in dry-run mode
    if (options.mode !== "dry-run" && !options.token && !process.env.HETZNER_API_TOKEN) {
      errors.push("--token is required (or set HETZNER_API_TOKEN)");
    }
    if (!options.serverName) {
      errors.push("--name is required");
    }
    if (!options.location) {
      errors.push("--location is required (use --list-locations to see options)");
    }
    if (!options.serverType) {
      errors.push("--type is required (use --list-types to see options)");
    }
  }

  return errors;
}

export function printHelp() {
  console.log(`
ship-it - Deploy to Hetzner with Kamal

Usage: ship-it [command] [options]

Commands:
  (default)              Interactive TUI dashboard
  preview create [ref]   Create a preview deploy (default: HEAD)
  preview list           List active previews
  preview delete <hash>  Delete a preview

Options:
  --dry-run              Use mocked Hetzner API (no real servers)
  --dev                  Real API, but auto-cleanup servers on exit
  -h, --help             Show this help message

Non-interactive deploy:
  -n, --non-interactive  Run deploy without TUI
  --token, -t <token>    Hetzner API token (or set HETZNER_API_TOKEN)
  --name <name>          Server name
  --location, -l <loc>   Location code (e.g., ash, fsn1, hel1)
  --type <type>          Server type (e.g., cx22, cx32)

Info:
  --list-locations       List available Hetzner locations
  --list-types           List available server types with pricing

Examples:
  ship-it                              # Interactive dashboard
  ship-it preview create               # Preview current commit
  ship-it preview create feature-branch  # Preview a branch
  ship-it preview list                 # Show active previews
  ship-it preview delete abc1234       # Remove a preview
`);
}
