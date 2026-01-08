/**
 * Shared types for ship-it.
 */

// Accessory types
export type AccessoryType = "postgres" | "redis" | "mysql";
export type AccessoryPlacement = "same-server" | "dedicated-server";

export interface AccessoryConfig {
  type: AccessoryType;
  password: string;
  port: number;
  database?: string;
  username?: string;
}

export interface AccessoriesConfig {
  enabled: boolean;
  accessories: AccessoryConfig[];
  placement: AccessoryPlacement;
  serverId?: number;
  serverIp?: string;
}

export const ACCESSORY_DEFAULTS: Record<AccessoryType, {
  image: string;
  port: number;
  database: string;
  username: string;
  dataDir: string;
}> = {
  postgres: {
    image: "postgres:16",
    port: 5432,
    database: "app_production",
    username: "app",
    dataDir: "/var/lib/postgresql/data",
  },
  redis: {
    image: "redis:7",
    port: 6379,
    database: "",
    username: "",
    dataDir: "/data",
  },
  mysql: {
    image: "mysql:8",
    port: 3306,
    database: "app_production",
    username: "app",
    dataDir: "/var/lib/mysql",
  },
};

export interface ProjectDeployment {
  id: string;
  projectPath: string;
  projectName: string;
  // Multi-server support (arrays)
  serverIds: number[];
  serverIps: string[];
  serverNames: string[];
  // Load balancer (optional, only if >1 server)
  loadBalancerId?: number;
  loadBalancerIp?: string;
  // Domain points to LB if present, else first server
  domain: string;
  createdAt: string;
  lastDeployedAt: string;
  status: "running" | "stopped" | "unknown";
  // Accessories (optional)
  accessories?: AccessoriesConfig;
}
