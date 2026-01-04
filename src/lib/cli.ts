export type RunMode = "production" | "dev" | "dry-run";

export interface CliOptions {
  mode: RunMode;
  interactive: boolean;
  // Non-interactive options
  token?: string;
  serverName?: string;
  location?: string;
  serverType?: string;
  projectName?: string;
  repoUrl?: string;
  // Info commands
  listLocations?: boolean;
  listTypes?: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    mode: "production",
    interactive: true,
  };

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
        break;
      case "--list-types":
        options.listTypes = true;
        options.interactive = false;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
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

function printHelp() {
  console.log(`
ship-it - Kamal deployment setup

Usage: ship-it [options]

Modes:
  (default)        Interactive TUI wizard
  --non-interactive, -n  Run without TUI (requires flags below)
  --dry-run        Use mocked Hetzner API (no real servers)
  --dev            Real API, but auto-cleanup servers on exit

Non-interactive options:
  --token, -t <token>    Hetzner API token (or set HETZNER_API_TOKEN)
  --name <name>          Server name
  --location, -l <loc>   Location code (e.g., ash, fsn1, hel1)
  --type <type>          Server type (e.g., cx22, cx32)
  --project, -p <name>   Project name for Kamal
  --repo, -r <url>       Git repository URL

Info commands:
  --list-locations       List available Hetzner locations
  --list-types           List available server types with pricing
  -h, --help             Show this help message

Examples:
  ship-it                              # Interactive wizard
  ship-it --dry-run                    # Test wizard with mock API
  ship-it --list-locations             # Show available locations
  ship-it --list-types --location ash  # Show types with US pricing

  ship-it -n --name my-server --location ash --type cx22 \\
    --project myapp --repo git@github.com:user/repo.git
`);
}
