# ship-it

Deploy your app to Hetzner Cloud with one command. Zero to production in minutes.

```
$ ship-it
```

ship-it is an interactive CLI that provisions Hetzner servers, configures [Kamal](https://kamal-deploy.org/) for containerized deployments, and gets your app live with SSL — all through a simple wizard.

## Features

- **Interactive wizard** — Answer a few questions, get a deployed app
- **Auto-detection** — Detects Rails, Node.js, and Bun projects; generates Dockerfiles
- **Multi-server deployments** — Scale horizontally with automatic load balancer setup
- **Database accessories** — PostgreSQL, Redis, MySQL with auto-generated passwords
- **SSL by default** — Automatic Let's Encrypt certificates (single server)
- **Dev mode** — Servers auto-delete on exit for testing
- **Dry-run mode** — Preview what would happen without creating resources

## Prerequisites

Before using ship-it, you'll need:

### 1. Hetzner Cloud Account
Create an account at [hetzner.com/cloud](https://www.hetzner.com/cloud) and generate an API token:
- Go to your project → Security → API Tokens
- Create a token with **Read & Write** permissions

### 2. Kamal (v2.0+)
```bash
gem install kamal
```

### 3. Docker Registry Account
You need somewhere to push your container images. Options:
- **Docker Hub** — Free tier available at [hub.docker.com](https://hub.docker.com)
- **GitHub Container Registry** — Free for public repos
- **Any Docker-compatible registry**

### 4. Bun Runtime
ship-it is built with Bun. Install it from [bun.sh](https://bun.sh):
```bash
curl -fsSL https://bun.sh/install | bash
```

## Installation

### From Source
```bash
git clone https://github.com/youruser/ship-it
cd ship-it
bun install
bun run build
```

### Run Directly
```bash
# Development
bun run dev

# Or with the compiled binary
bun run compile
./ship-it
```

## Quick Start

1. Navigate to your project directory:
   ```bash
   cd your-app
   ```

2. Run ship-it:
   ```bash
   ship-it
   ```

3. Follow the wizard:
   - Enter your Hetzner API token
   - Configure your Docker registry credentials
   - Choose server location and size
   - Select optional accessories (Postgres, Redis, MySQL)
   - Watch it deploy!

4. Your app is live at the displayed URL.

## Usage

### Modes

```bash
# Production mode (default) — creates real servers
ship-it

# Dev mode — servers auto-delete when you exit
ship-it --dev

# Dry-run mode — simulates everything, creates nothing
ship-it --dry-run
```

### After Deployment

ship-it configures Kamal in your project. Use Kamal commands for ongoing management:

```bash
# Deploy new changes
kamal deploy

# View logs
kamal app logs

# SSH into container
kamal app exec bash

# Restart the app
kamal app boot

# Rollback to previous version
kamal rollback
```

## Configuration

### Server Types

ship-it shows available Hetzner server types with pricing. Popular options:

| Type | CPU | RAM | Disk | ~Price/mo |
|------|-----|-----|------|-----------|
| cx22 | 2 vCPU | 4 GB | 40 GB | €4.35 |
| cx32 | 4 vCPU | 8 GB | 80 GB | €8.09 |
| cax11 | 2 ARM | 4 GB | 40 GB | €3.79 |

### Multi-Server Deployments

When you select 2+ servers:
- A Hetzner Load Balancer is automatically created
- Traffic is distributed across all servers
- SSL is disabled (use Cloudflare or custom certs for HTTPS)

### Accessories

Select databases/caches during setup:

| Accessory | Default Port | Image |
|-----------|-------------|-------|
| PostgreSQL | 5432 | postgres:16 |
| Redis | 6379 | redis:7 |
| MySQL | 3306 | mysql:8 |

**Placement options:**
- **Same server** — Accessories run alongside your app (simpler, no extra cost)
- **Dedicated server** — Separate server for databases (better isolation, ~€4/mo extra)

Passwords are auto-generated and stored in `.kamal/secrets`.

## Project Structure

After running ship-it, your project will have:

```
your-app/
├── config/
│   └── deploy.yml      # Kamal configuration
├── .kamal/
│   └── secrets         # Registry password, DB passwords
└── Dockerfile          # Generated if not present
```

## How It Works

1. **Detects your project** — Looks for Gemfile (Rails), bun.lockb (Bun), or package.json (Node)
2. **Generates Dockerfile** — If you don't have one, creates an appropriate Dockerfile
3. **Provisions infrastructure** — Creates Hetzner server(s), firewall, SSH keys, optional load balancer
4. **Configures Kamal** — Generates deploy.yml and secrets
5. **Runs `kamal setup`** — Installs Docker, builds your image, deploys

## Troubleshooting

### "Kamal not installed"
Install Kamal with `gem install kamal`. Requires Ruby.

### "SSH connection failed"
New servers take ~60 seconds for SSH to become available. ship-it waits automatically, but network issues can cause timeouts.

### "Registry authentication failed"
Double-check your registry credentials. For Docker Hub, use your username (not email) and an access token.

### Multi-server SSL error
Kamal's built-in SSL only works with single servers. For multi-server deployments, use a CDN like Cloudflare for SSL termination.

## Development

```bash
# Run tests
bun test

# Watch mode
bun test --watch

# Type check
bunx tsc --noEmit
```

## License

MIT
