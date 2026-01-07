/**
 * Shared types for ship-it.
 */

export interface ProjectDeployment {
  id: string;
  projectPath: string;
  projectName: string;
  serverId: number;
  serverIp: string;
  serverName: string;
  domain: string;
  createdAt: string;
  lastDeployedAt: string;
  status: "running" | "stopped" | "unknown";
}
