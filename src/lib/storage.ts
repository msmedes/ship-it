/**
 * Persistent storage for deployments.
 */

import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import type { ProjectDeployment } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "ship-it");
const DEPLOYMENTS_FILE = join(CONFIG_DIR, "deployments.json");

/**
 * Migrate old single-server deployment format to new multi-server format.
 */
function migrateDeployment(d: Record<string, unknown>): ProjectDeployment {
  // Check if it's the old format (has serverId instead of serverIds)
  if (typeof d.serverId === "number" && !Array.isArray(d.serverIds)) {
    return {
      id: d.id as string,
      projectPath: d.projectPath as string,
      projectName: d.projectName as string,
      serverIds: [d.serverId as number],
      serverIps: [d.serverIp as string],
      serverNames: [d.serverName as string],
      domain: d.domain as string,
      createdAt: d.createdAt as string,
      lastDeployedAt: d.lastDeployedAt as string,
      status: d.status as ProjectDeployment["status"],
    };
  }
  return d as unknown as ProjectDeployment;
}

export async function loadDeployments(): Promise<ProjectDeployment[]> {
  try {
    const content = await readFile(DEPLOYMENTS_FILE, "utf-8");
    const raw = JSON.parse(content) as Record<string, unknown>[];
    return raw.map(migrateDeployment);
  } catch {
    return [];
  }
}

export async function saveDeployment(deployment: ProjectDeployment): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  const deployments = await loadDeployments();
  const existingIndex = deployments.findIndex((d) => d.id === deployment.id);

  if (existingIndex >= 0) {
    deployments[existingIndex] = deployment;
  } else {
    deployments.push(deployment);
  }

  await writeFile(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));
}

export async function removeDeployment(id: string): Promise<void> {
  const deployments = await loadDeployments();
  const filtered = deployments.filter((d) => d.id !== id);
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(DEPLOYMENTS_FILE, JSON.stringify(filtered, null, 2));
}

export async function getDeploymentByPath(projectPath: string): Promise<ProjectDeployment | null> {
  const deployments = await loadDeployments();
  return deployments.find((d) => d.projectPath === projectPath) || null;
}

export async function getDeploymentById(id: string): Promise<ProjectDeployment | null> {
  const deployments = await loadDeployments();
  return deployments.find((d) => d.id === id) || null;
}

export async function updateDeploymentStatus(
  id: string,
  status: ProjectDeployment["status"]
): Promise<void> {
  const deployments = await loadDeployments();
  const deployment = deployments.find((d) => d.id === id);
  if (deployment) {
    deployment.status = status;
    await writeFile(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));
  }
}

export async function updateLastDeployed(id: string): Promise<void> {
  const deployments = await loadDeployments();
  const deployment = deployments.find((d) => d.id === id);
  if (deployment) {
    deployment.lastDeployedAt = new Date().toISOString();
    await writeFile(DEPLOYMENTS_FILE, JSON.stringify(deployments, null, 2));
  }
}
