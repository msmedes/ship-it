import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";

export interface Config {
  hetznerToken?: string;
}

const CONFIG_DIR = join(homedir(), ".config", "ship-it");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export async function loadConfig(): Promise<Config> {
  try {
    // Check env var first
    const envToken = process.env.HETZNER_API_TOKEN;
    if (envToken) {
      return { hetznerToken: envToken };
    }

    // Then check config file
    const content = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as Config;
  } catch {
    return {};
  }
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
