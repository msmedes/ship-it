const HETZNER_API = "https://api.hetzner.cloud/v1";

export interface ServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  prices: Array<{
    location: string;
    price_monthly: { gross: string };
  }>;
}

export interface Location {
  id: number;
  name: string;
  city: string;
  country: string;
}

export interface Server {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: { ip: string };
    ipv6: { ip: string };
  };
}

export interface SSHKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

export interface Firewall {
  id: number;
  name: string;
}

interface HetznerResponse<T> {
  data?: T;
  error?: { message: string; code: string };
}

async function hetznerFetch<T>(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${HETZNER_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }

  return data;
}

export async function validateHetznerToken(
  token: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    await hetznerFetch("/servers?per_page=1", token);
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Invalid token",
    };
  }
}

export async function getServerTypes(token: string): Promise<ServerType[]> {
  const response = await hetznerFetch<{ server_types: ServerType[] }>(
    "/server_types?per_page=50",
    token
  );
  // Sort by cores then memory
  return response.server_types.sort((a, b) => a.cores - b.cores || a.memory - b.memory);
}

export async function getLocations(token: string): Promise<Location[]> {
  const response = await hetznerFetch<{ locations: Location[] }>(
    "/locations",
    token
  );
  return response.locations;
}

export async function createServer(
  token: string,
  options: {
    name: string;
    serverType: string;
    location: string;
    sshKeyName?: string;
  }
): Promise<Server> {
  const response = await hetznerFetch<{ server: Server; root_password?: string }>(
    "/servers",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name: options.name,
        server_type: options.serverType,
        location: options.location,
        image: "ubuntu-24.04",
        ssh_keys: options.sshKeyName ? [options.sshKeyName] : undefined,
        start_after_create: true,
      }),
    }
  );

  return response.server;
}

export async function getServer(token: string, serverId: number): Promise<Server> {
  const response = await hetznerFetch<{ server: Server }>(
    `/servers/${serverId}`,
    token
  );
  return response.server;
}

export async function waitForServer(
  token: string,
  serverId: number,
  timeoutMs = 120000
): Promise<Server> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const server = await getServer(token, serverId);
    if (server.status === "running") {
      return server;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Server creation timed out");
}

// SSH Key Management

export async function getSSHKeys(token: string): Promise<SSHKey[]> {
  const response = await hetznerFetch<{ ssh_keys: SSHKey[] }>(
    "/ssh_keys",
    token
  );
  return response.ssh_keys;
}

export async function getSSHKeyByName(token: string, name: string): Promise<SSHKey | null> {
  const keys = await getSSHKeys(token);
  return keys.find((k) => k.name === name) || null;
}

export async function createSSHKey(
  token: string,
  name: string,
  publicKey: string
): Promise<SSHKey> {
  const response = await hetznerFetch<{ ssh_key: SSHKey }>(
    "/ssh_keys",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        public_key: publicKey,
      }),
    }
  );
  return response.ssh_key;
}

export async function deleteSSHKey(token: string, keyId: number): Promise<void> {
  await hetznerFetch(`/ssh_keys/${keyId}`, token, { method: "DELETE" });
}

/**
 * Get or create an SSH key in Hetzner.
 * If a key with the same name exists, returns it.
 */
export async function ensureSSHKey(
  token: string,
  name: string,
  publicKey: string
): Promise<SSHKey> {
  const existing = await getSSHKeyByName(token, name);
  if (existing) {
    return existing;
  }
  return createSSHKey(token, name, publicKey);
}

// Firewall Management

export interface FirewallOptions {
  accessoryPorts?: number[];
}

export async function createFirewall(
  token: string,
  name: string,
  options: FirewallOptions = {}
): Promise<Firewall> {
  const rules = [
    {
      description: "SSH",
      direction: "in",
      protocol: "tcp",
      port: "22",
      source_ips: ["0.0.0.0/0", "::/0"],
    },
    {
      description: "HTTP",
      direction: "in",
      protocol: "tcp",
      port: "80",
      source_ips: ["0.0.0.0/0", "::/0"],
    },
    {
      description: "HTTPS",
      direction: "in",
      protocol: "tcp",
      port: "443",
      source_ips: ["0.0.0.0/0", "::/0"],
    },
  ];

  // Add accessory ports (for dedicated DB server)
  if (options.accessoryPorts) {
    for (const port of options.accessoryPorts) {
      rules.push({
        description: `DB port ${port}`,
        direction: "in",
        protocol: "tcp",
        port: String(port),
        source_ips: ["0.0.0.0/0", "::/0"],
      });
    }
  }

  const response = await hetznerFetch<{ firewall: Firewall }>(
    "/firewalls",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        rules,
      }),
    }
  );
  return response.firewall;
}

export async function applyFirewallToServer(
  token: string,
  firewallId: number,
  serverId: number
): Promise<void> {
  await hetznerFetch(
    `/firewalls/${firewallId}/actions/apply_to_resources`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        apply_to: [{ type: "server", server: { id: serverId } }],
      }),
    }
  );
}

export async function getFirewallByName(token: string, name: string): Promise<Firewall | null> {
  const response = await hetznerFetch<{ firewalls: Firewall[] }>(
    "/firewalls",
    token
  );
  return response.firewalls.find((f) => f.name === name) || null;
}

/**
 * Get or create a firewall with standard web rules.
 */
export async function ensureFirewall(
  token: string,
  name: string,
  options: FirewallOptions = {}
): Promise<Firewall> {
  const existing = await getFirewallByName(token, name);
  if (existing) {
    return existing;
  }
  return createFirewall(token, name, options);
}

// Load Balancer Management

export interface LoadBalancer {
  id: number;
  name: string;
  public_net: {
    enabled: boolean;
    ipv4: { ip: string };
    ipv6: { ip: string };
  };
  algorithm: { type: string };
  services: Array<{
    protocol: string;
    listen_port: number;
    destination_port: number;
    proxyprotocol: boolean;
  }>;
  targets: Array<{
    type: string;
    server?: { id: number };
    health_status?: Array<{ status: string }>;
  }>;
  load_balancer_type: {
    id: number;
    name: string;
    description: string;
  };
}

export interface CreateLoadBalancerOptions {
  name: string;
  location: string;
  algorithm?: "round_robin" | "least_connections";
  serverIds: number[];
  listenPort?: number;
  destinationPort?: number;
}

export async function createLoadBalancer(
  token: string,
  options: CreateLoadBalancerOptions
): Promise<LoadBalancer> {
  const {
    name,
    location,
    algorithm = "round_robin",
    serverIds,
    listenPort = 443,
    destinationPort = 443,
  } = options;

  const response = await hetznerFetch<{ load_balancer: LoadBalancer }>(
    "/load_balancers",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name,
        load_balancer_type: "lb11", // Smallest type
        location,
        algorithm: { type: algorithm },
        targets: serverIds.map((id) => ({
          type: "server",
          server: { id },
          use_private_ip: false,
        })),
        services: [
          {
            protocol: "tcp",
            listen_port: 80,
            destination_port: 80,
            proxyprotocol: false,
          },
          {
            protocol: "tcp",
            listen_port: listenPort,
            destination_port: destinationPort,
            proxyprotocol: false,
          },
        ],
      }),
    }
  );

  return response.load_balancer;
}

export async function getLoadBalancer(
  token: string,
  loadBalancerId: number
): Promise<LoadBalancer> {
  const response = await hetznerFetch<{ load_balancer: LoadBalancer }>(
    `/load_balancers/${loadBalancerId}`,
    token
  );
  return response.load_balancer;
}

export async function deleteLoadBalancer(
  token: string,
  loadBalancerId: number
): Promise<void> {
  await hetznerFetch(`/load_balancers/${loadBalancerId}`, token, {
    method: "DELETE",
  });
}

export async function addTargetToLoadBalancer(
  token: string,
  loadBalancerId: number,
  serverId: number
): Promise<void> {
  await hetznerFetch(
    `/load_balancers/${loadBalancerId}/actions/add_target`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        type: "server",
        server: { id: serverId },
        use_private_ip: false,
      }),
    }
  );
}

export async function removeTargetFromLoadBalancer(
  token: string,
  loadBalancerId: number,
  serverId: number
): Promise<void> {
  await hetznerFetch(
    `/load_balancers/${loadBalancerId}/actions/remove_target`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        type: "server",
        server: { id: serverId },
      }),
    }
  );
}

/**
 * Wait for a load balancer to have a public IP assigned.
 */
export async function waitForLoadBalancer(
  token: string,
  loadBalancerId: number,
  timeoutMs = 60000
): Promise<LoadBalancer> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const lb = await getLoadBalancer(token, loadBalancerId);
    if (lb.public_net?.ipv4?.ip) {
      return lb;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error("Load balancer creation timed out");
}
