# ship-it

A TUI and CLI tool for setting up Kamal deployments on Hetzner Cloud.

## Project Structure

```
src/
├── index.tsx              # Entry point - routes to TUI or CLI
├── App.tsx                # Main TUI app component
├── components/steps/      # TUI wizard step components
│   ├── Welcome.tsx
│   ├── HetznerSetup.tsx   # Token input/validation
│   ├── ServerCreate.tsx   # Location + type selection
│   ├── KamalInit.tsx      # Project + repo setup
│   └── Complete.tsx
└── lib/
    ├── cli.ts             # Argument parsing
    ├── runner.ts          # Non-interactive CLI runner
    ├── config.ts          # Config file (~/.config/ship-it/config.json)
    ├── cleanup.ts         # Dev mode server cleanup
    ├── hetzner.ts         # Real Hetzner API client
    ├── hetzner-mock.ts    # Mock client for --dry-run
    ├── hetzner-context.tsx # React context for client switching
    └── kamal.ts           # Kamal/SSH operations (stub)
```

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Run TUI (interactive)
bun run dev -- --dry-run # Run TUI with mock API
bun run dev -- --help    # Show CLI help
bun test                 # Run tests
bun run build            # Build to dist/
bun run compile          # Compile to single binary
```

## Run Modes

- **Production** (default): Real Hetzner API
- **`--dry-run`**: Mock API, no real servers created
- **`--dev`**: Real API, but auto-deletes servers on exit (Ctrl+C)

## Non-Interactive Mode

```bash
bun run dev -- -n --name my-server --location ash --type cx22
```

Use `--list-locations` and `--list-types` to see available options.

## Architecture Notes

- Uses Ink (React for CLIs) for the TUI
- Hetzner client is swapped via React context based on run mode
- Dev mode persists server IDs to `/tmp/ship-it-cleanup.json` to survive crashes
- Config stored in `~/.config/ship-it/config.json` or `HETZNER_API_TOKEN` env var

## TODO

- [ ] SSH key selection during server creation
- [ ] Implement kamal.ts (SSH, Docker install, kamal init)
- [ ] Add more tests for CLI argument parsing
- [ ] Error recovery in wizard (retry on failure)
