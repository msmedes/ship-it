import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

export interface RegistryConfig {
  server: string;  // e.g., "ghcr.io", "docker.io"
  username: string;
  password: string; // token/password
}

export interface Config {
  hetznerToken?: string;
  registry?: RegistryConfig;
}

const CONFIG_DIR = join(homedir(), ".config", "ship-it");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<Config> {
  try {
    // Start with config file
    let config: Config = {};
    try {
      const content = await readFile(CONFIG_FILE, "utf-8");
      config = JSON.parse(content) as Config;
    } catch {
      // No config file yet
    }

    // Override hetznerToken from env if present
    const envToken = process.env.HETZNER_API_TOKEN;
    if (envToken) {
      config.hetznerToken = envToken;
    }

    return config;
  } catch {
    return {};
  }
}

export function isConfigComplete(config: Config): { complete: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!config.hetznerToken) {
    missing.push("hetznerToken");
  }
  if (!config.registry?.server) {
    missing.push("registry.server");
  }
  if (!config.registry?.username) {
    missing.push("registry.username");
  }
  if (!config.registry?.password) {
    missing.push("registry.password");
  }

  return { complete: missing.length === 0, missing };
}

export async function saveConfig(config: Config): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  // Merge with existing config
  const existing = await loadConfig();
  const merged = { ...existing, ...config };

  await writeFile(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
