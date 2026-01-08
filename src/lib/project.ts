/**
 * Project detection and Kamal config generation.
 */

import { access, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import type { AccessoriesConfig, AccessoryConfig } from "./types.js";
import { ACCESSORY_DEFAULTS } from "./types.js";

export type ProjectType = "rails" | "node" | "bun" | "generic";

export interface ProjectInfo {
  type: ProjectType;
  name: string;
  path: string;
  hasDockerfile: boolean;
  port: number;
}

/**
 * Detect project type from the current directory.
 */
export async function detectProject(projectPath: string = process.cwd()): Promise<ProjectInfo> {
  const name = basename(projectPath);
  let type: ProjectType = "generic";
  let port = 3000;
  let hasDockerfile = false;

  // Check for Dockerfile
  try {
    await access(join(projectPath, "Dockerfile"));
    hasDockerfile = true;
  } catch {
    // No Dockerfile
  }

  // Detect Rails
  try {
    await access(join(projectPath, "Gemfile"));
    const gemfile = await readFile(join(projectPath, "Gemfile"), "utf-8");
    if (gemfile.includes("rails")) {
      type = "rails";
      port = 3000;
    }
  } catch {
    // Not Rails
  }

  // Detect Bun
  try {
    await access(join(projectPath, "bun.lockb"));
    type = "bun";
    port = 3000;
  } catch {
    // Not Bun, check for Node
    try {
      await access(join(projectPath, "package.json"));
      const pkg = JSON.parse(await readFile(join(projectPath, "package.json"), "utf-8"));
      type = "node";
      // Try to detect port from package.json scripts
      if (pkg.scripts?.start?.includes("3000")) port = 3000;
      if (pkg.scripts?.start?.includes("8080")) port = 8080;
    } catch {
      // Not Node either
    }
  }

  return {
    type,
    name,
    path: projectPath,
    hasDockerfile,
    port,
  };
}

/**
 * Generate a Dockerfile if one doesn't exist.
 */
export async function generateDockerfile(project: ProjectInfo): Promise<string> {
  const dockerfilePath = join(project.path, "Dockerfile");

  // Check if Dockerfile already exists
  try {
    await access(dockerfilePath);
    return dockerfilePath; // Already exists
  } catch {
    // Generate one
  }

  let content: string;

  switch (project.type) {
    case "rails":
      content = `# syntax=docker/dockerfile:1
FROM ruby:3.2-slim

WORKDIR /app

# Install dependencies
RUN apt-get update -qq && \\
    apt-get install --no-install-recommends -y build-essential libpq-dev nodejs npm && \\
    rm -rf /var/lib/apt/lists/*

# Install gems
COPY Gemfile Gemfile.lock ./
RUN bundle install

# Copy application
COPY . .

# Precompile assets
RUN bundle exec rails assets:precompile

EXPOSE 3000
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0"]
`;
      break;

    case "bun":
      content = `FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE ${project.port}
CMD ["bun", "run", "start"]
`;
      break;

    case "node":
      content = `FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE ${project.port}
CMD ["npm", "start"]
`;
      break;

    default:
      content = `FROM ubuntu:22.04

WORKDIR /app

COPY . .

EXPOSE ${project.port}
CMD ["./start.sh"]
`;
  }

  await writeFile(dockerfilePath, content);
  return dockerfilePath;
}

export interface DeployConfig {
  service: string;
  image: string;
  servers: string[];
  proxy: {
    host: string;
    ssl: boolean;
  };
  registry: {
    server: string;
    username: string;
    password: string;
  } | null;
  env: Record<string, string>;
  builder: {
    remote: boolean;
  };
}

export interface RegistryConfig {
  server: string;
  username: string;
}

/**
 * Generate a clean deploy.yml instead of modifying kamal init output.
 * This is more reliable than trying to regex-replace the template.
 */
export async function modifyDeployYml(
  projectPath: string,
  serverIps: string | string[],
  options: {
    domain?: string;
    sshKeyPath?: string;
    registry?: RegistryConfig;
    port?: number;
    accessories?: AccessoriesConfig;
    accessoriesHost?: string;
  } = {}
): Promise<string> {
  const deployPath = join(projectPath, "config", "deploy.yml");
  const projectName = basename(projectPath);

  // Normalize to array
  const ips = Array.isArray(serverIps) ? serverIps : [serverIps];
  const primaryIp = ips[0];

  // Use nip.io for wildcard DNS when no domain provided
  const host = options.domain || `${primaryIp}.nip.io`;

  // Build image name based on registry
  let imageName: string;
  if (options.registry) {
    const { server, username } = options.registry;
    if (server === "docker.io") {
      imageName = `${username}/${projectName}`;
    } else {
      imageName = `${server}/${username}/${projectName}`;
    }
  } else {
    imageName = `${projectName}/${projectName}`;
  }

  // Kamal's built-in SSL (Let's Encrypt) only works with single server
  // For multi-server, disable SSL - traffic goes through LB on port 80
  const isMultiServer = ips.length > 1;
  const useSSL = !isMultiServer;

  // Generate servers list YAML
  const serversYaml = ips.map((ip) => `  - ${ip}`).join("\n");

  // Generate clean deploy.yml
  const appPort = options.port || 3000;
  let content = `# Generated by ship-it
service: ${projectName}

image: ${imageName}

servers:
${serversYaml}

proxy:
  ssl: ${useSSL}
  host: ${host}
  app_port: ${appPort}
  healthcheck:
    path: /up
`;

  // Add SSH config if provided
  if (options.sshKeyPath) {
    content += `
ssh:
  keys_only: true
  keys:
    - ${options.sshKeyPath}
`;
  }

  // Add registry config
  if (options.registry) {
    // Docker Hub doesn't need a server specified (it's the default)
    if (options.registry.server === "docker.io") {
      content += `
registry:
  username: ${options.registry.username}
  password:
    - KAMAL_REGISTRY_PASSWORD
`;
    } else {
      content += `
registry:
  server: ${options.registry.server}
  username: ${options.registry.username}
  password:
    - KAMAL_REGISTRY_PASSWORD
`;
    }
  }

  // Add builder config (build locally, push to registry)
  content += `
builder:
  arch: amd64
`;

  // Add accessories if enabled
  if (options.accessories?.enabled && options.accessories.accessories.length > 0) {
    content += generateAccessoriesYaml(options.accessories, options.accessoriesHost);
  }

  await writeFile(deployPath, content);
  return deployPath;
}

/**
 * Generate accessories YAML section for deploy.yml.
 */
function generateAccessoriesYaml(
  accessories: AccessoriesConfig,
  host?: string
): string {
  if (!accessories.enabled || accessories.accessories.length === 0) {
    return "";
  }

  const accessoriesHost = host || "localhost";
  let yaml = "\naccessories:\n";

  for (const accessory of accessories.accessories) {
    const defaults = ACCESSORY_DEFAULTS[accessory.type];
    const name = accessory.type === "postgres" ? "db" : accessory.type;

    yaml += `  ${name}:\n`;
    yaml += `    image: ${defaults.image}\n`;
    yaml += `    host: ${accessoriesHost}\n`;
    yaml += `    port: ${accessory.port}\n`;

    // Environment variables
    if (accessory.type === "postgres") {
      yaml += `    env:\n`;
      yaml += `      clear:\n`;
      yaml += `        POSTGRES_USER: ${accessory.username || defaults.username}\n`;
      yaml += `        POSTGRES_DB: ${accessory.database || defaults.database}\n`;
      yaml += `      secret:\n`;
      yaml += `        - POSTGRES_PASSWORD\n`;
    } else if (accessory.type === "mysql") {
      yaml += `    env:\n`;
      yaml += `      clear:\n`;
      yaml += `        MYSQL_USER: ${accessory.username || defaults.username}\n`;
      yaml += `        MYSQL_DATABASE: ${accessory.database || defaults.database}\n`;
      yaml += `      secret:\n`;
      yaml += `        - MYSQL_PASSWORD\n`;
      yaml += `        - MYSQL_ROOT_PASSWORD\n`;
    } else if (accessory.type === "redis") {
      yaml += `    cmd: redis-server --requirepass "$REDIS_PASSWORD"\n`;
      yaml += `    env:\n`;
      yaml += `      secret:\n`;
      yaml += `        - REDIS_PASSWORD\n`;
    }

    // Data directory for persistence
    yaml += `    directories:\n`;
    yaml += `      - data:${defaults.dataDir}\n`;
  }

  return yaml;
}

/**
 * Write .kamal/secrets with registry password.
 */
export async function writeKamalSecrets(
  projectPath: string,
  registryPassword: string,
  accessories?: AccessoriesConfig
): Promise<string> {
  const kamalDir = join(projectPath, ".kamal");
  const secretsPath = join(kamalDir, "secrets");

  await mkdir(kamalDir, { recursive: true });

  let content = `# Kamal secrets - generated by ship-it
KAMAL_REGISTRY_PASSWORD=${registryPassword}
`;

  // Add accessory passwords
  if (accessories?.enabled && accessories.accessories.length > 0) {
    content += "\n# Accessory passwords\n";
    for (const accessory of accessories.accessories) {
      if (accessory.type === "postgres") {
        content += `POSTGRES_PASSWORD=${accessory.password}\n`;
      } else if (accessory.type === "mysql") {
        content += `MYSQL_PASSWORD=${accessory.password}\n`;
        content += `MYSQL_ROOT_PASSWORD=${accessory.password}\n`;
      } else if (accessory.type === "redis") {
        content += `REDIS_PASSWORD=${accessory.password}\n`;
      }
    }
  }

  await writeFile(secretsPath, content);
  return secretsPath;
}

/**
 * Read .env file and generate .kamal/secrets.
 */
export async function generateSecrets(projectPath: string = process.cwd()): Promise<string> {
  const kamalDir = join(projectPath, ".kamal");
  const secretsPath = join(kamalDir, "secrets");

  await mkdir(kamalDir, { recursive: true });

  // Try to read .env file
  let envVars: Record<string, string> = {};
  try {
    const envContent = await readFile(join(projectPath, ".env"), "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key) {
          envVars[key] = valueParts.join("=");
        }
      }
    }
  } catch {
    // No .env file, use defaults
  }

  // Generate secrets file
  let content = `# Kamal secrets
# Generated by ship-it
# Source: .env file

`;

  // Add common secrets with values from .env or placeholders
  const secretKeys = [
    "SECRET_KEY_BASE",
    "DATABASE_URL",
    "REDIS_URL",
    "KAMAL_REGISTRY_PASSWORD",
  ];

  for (const key of secretKeys) {
    if (envVars[key]) {
      content += `${key}=${envVars[key]}\n`;
    } else if (key === "SECRET_KEY_BASE") {
      // Generate a random secret key base
      const randomKey = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      content += `${key}=${randomKey}\n`;
    } else {
      content += `# ${key}=\n`;
    }
  }

  // Add any other env vars from .env
  content += "\n# From .env:\n";
  for (const [key, value] of Object.entries(envVars)) {
    if (!secretKeys.includes(key)) {
      content += `${key}=${value}\n`;
    }
  }

  await writeFile(secretsPath, content);
  return secretsPath;
}
