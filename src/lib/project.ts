/**
 * Project detection and Kamal config generation.
 */

import { access, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";

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
 * Modify existing deploy.yml created by kamal init.
 */
export async function modifyDeployYml(
  projectPath: string,
  serverIp: string,
  options: {
    domain?: string;
    sshKeyPath?: string;
    registry?: RegistryConfig;
  } = {}
): Promise<string> {
  const deployPath = join(projectPath, "config", "deploy.yml");
  const projectName = basename(projectPath);

  let content = await readFile(deployPath, "utf-8");

  const domain = options.domain || `${serverIp}.nip.io`;

  // Replace service name
  content = content.replace(/^service: my-app$/m, `service: ${projectName}`);

  // Build image name based on registry
  let imageName: string;
  if (options.registry) {
    const { server, username } = options.registry;
    if (server === "docker.io") {
      // Docker Hub uses username/image format
      imageName = `${username}/${projectName}`;
    } else {
      // Other registries use server/username/image format
      imageName = `${server}/${username}/${projectName}`;
    }
  } else {
    imageName = `${projectName}/${projectName}`;
  }

  // Replace image name
  content = content.replace(/^image: my-user\/my-app$/m, `image: ${imageName}`);

  // Replace servers block - convert from role-based to simple list
  content = content.replace(
    /servers:\s*\n\s*web:\s*\n\s*-\s*[\d.]+/,
    `servers:\n  - ${serverIp}`
  );

  // Remove the commented job section if present
  content = content.replace(/\s*#\s*job:[\s\S]*?#\s*cmd:.*\n/g, '\n');

  // Update proxy host and ssl
  content = content.replace(/ssl: true/, `ssl: false`);
  content = content.replace(/host: app\.example\.com/, `host: ${domain}`);

  // Add healthcheck to proxy section
  content = content.replace(
    /(proxy:[\s\S]*?host: [^\n]+)/,
    `$1\n  healthcheck:\n    path: /up`
  );

  // Update registry section with actual registry config
  if (options.registry) {
    content = content.replace(
      /^registry:\s*\n\s*server: localhost:5555/m,
      `registry:\n  server: ${options.registry.server}\n  username: ${options.registry.username}\n  password:\n    - KAMAL_REGISTRY_PASSWORD`
    );
  } else {
    // Comment out registry section if no registry provided
    content = content.replace(
      /^registry:\s*\n\s*server: localhost:5555/m,
      `# registry:\n#   server: localhost:5555`
    );
  }

  // Add remote builder
  content = content.replace(
    /^builder:\s*\n\s*arch: amd64/m,
    `builder:\n  remote: true\n  arch: amd64`
  );

  // Add SSH key configuration if provided
  if (options.sshKeyPath) {
    // Find a good place to insert - after proxy section
    content = content.replace(
      /(proxy:[\s\S]*?)(# Credentials for your image host)/,
      `$1ssh:\n  keys_only: true\n  keys:\n    - ${options.sshKeyPath}\n\n$2`
    );
  }

  await writeFile(deployPath, content);
  return deployPath;
}

/**
 * Write .kamal/secrets with registry password.
 */
export async function writeKamalSecrets(
  projectPath: string,
  registryPassword: string
): Promise<string> {
  const kamalDir = join(projectPath, ".kamal");
  const secretsPath = join(kamalDir, "secrets");

  await mkdir(kamalDir, { recursive: true });

  const content = `# Kamal secrets - generated by ship-it
KAMAL_REGISTRY_PASSWORD=${registryPassword}
`;

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
