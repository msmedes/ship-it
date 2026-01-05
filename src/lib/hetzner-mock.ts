/**
 * Mock Hetzner client for --dry-run mode.
 * Simulates API responses with realistic delays.
 */

import type { ServerType, Location, Server, SSHKey, Firewall } from "./hetzner.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_SERVER_TYPES: ServerType[] = [
  {
    id: 1,
    name: "cx22",
    description: "CX22",
    cores: 2,
    memory: 4,
    disk: 40,
    prices: [
      { location: "fsn1", price_monthly: { gross: "4.35" } },
      { location: "nbg1", price_monthly: { gross: "4.35" } },
      { location: "hel1", price_monthly: { gross: "4.35" } },
      { location: "ash", price_monthly: { gross: "5.39" } },
      { location: "hil", price_monthly: { gross: "5.39" } },
      { location: "sin", price_monthly: { gross: "5.99" } },
    ],
  },
  {
    id: 2,
    name: "cx32",
    description: "CX32",
    cores: 4,
    memory: 8,
    disk: 80,
    prices: [
      { location: "fsn1", price_monthly: { gross: "8.09" } },
      { location: "nbg1", price_monthly: { gross: "8.09" } },
      { location: "hel1", price_monthly: { gross: "8.09" } },
      { location: "ash", price_monthly: { gross: "9.99" } },
      { location: "hil", price_monthly: { gross: "9.99" } },
      { location: "sin", price_monthly: { gross: "10.99" } },
    ],
  },
  {
    id: 3,
    name: "cx42",
    description: "CX42",
    cores: 8,
    memory: 16,
    disk: 160,
    prices: [
      { location: "fsn1", price_monthly: { gross: "15.59" } },
      { location: "nbg1", price_monthly: { gross: "15.59" } },
      { location: "hel1", price_monthly: { gross: "15.59" } },
      { location: "ash", price_monthly: { gross: "18.99" } },
      { location: "hil", price_monthly: { gross: "18.99" } },
      { location: "sin", price_monthly: { gross: "20.99" } },
    ],
  },
  {
    id: 4,
    name: "cax11",
    description: "CAX11 (Arm64)",
    cores: 2,
    memory: 4,
    disk: 40,
    prices: [
      { location: "fsn1", price_monthly: { gross: "3.79" } },
      { location: "nbg1", price_monthly: { gross: "3.79" } },
      { location: "hel1", price_monthly: { gross: "3.79" } },
    ],
  },
  {
    id: 5,
    name: "cax21",
    description: "CAX21 (Arm64)",
    cores: 4,
    memory: 8,
    disk: 80,
    prices: [
      { location: "fsn1", price_monthly: { gross: "6.49" } },
      { location: "nbg1", price_monthly: { gross: "6.49" } },
      { location: "hel1", price_monthly: { gross: "6.49" } },
    ],
  },
  {
    id: 6,
    name: "cpx11",
    description: "CPX11",
    cores: 2,
    memory: 2,
    disk: 40,
    prices: [
      { location: "fsn1", price_monthly: { gross: "4.49" } },
      { location: "nbg1", price_monthly: { gross: "4.49" } },
      { location: "hel1", price_monthly: { gross: "4.49" } },
      { location: "ash", price_monthly: { gross: "5.49" } },
      { location: "hil", price_monthly: { gross: "5.49" } },
      { location: "sin", price_monthly: { gross: "5.99" } },
    ],
  },
];

const MOCK_LOCATIONS: Location[] = [
  { id: 1, name: "fsn1", city: "Falkenstein", country: "DE" },
  { id: 2, name: "nbg1", city: "Nuremberg", country: "DE" },
  { id: 3, name: "hel1", city: "Helsinki", country: "FI" },
  { id: 4, name: "ash", city: "Ashburn, VA", country: "US" },
  { id: 5, name: "hil", city: "Hillsboro, OR", country: "US" },
  { id: 6, name: "sin", city: "Singapore", country: "SG" },
];

let mockServerId = 10000;

export async function validateHetznerToken(
  _token: string
): Promise<{ valid: boolean; error?: string }> {
  await delay(500); // Simulate network latency

  // Accept any non-empty token in dry-run mode
  if (_token && _token.length > 0) {
    return { valid: true };
  }
  return { valid: false, error: "Token cannot be empty" };
}

export async function getServerTypes(_token: string): Promise<ServerType[]> {
  await delay(300);
  return [...MOCK_SERVER_TYPES].sort((a, b) => a.cores - b.cores || a.memory - b.memory);
}

export async function getLocations(_token: string): Promise<Location[]> {
  await delay(200);
  return [...MOCK_LOCATIONS];
}

export async function createServer(
  _token: string,
  options: {
    name: string;
    serverType: string;
    location: string;
    sshKeyName?: string;
  }
): Promise<Server> {
  await delay(2000); // Simulate server creation time

  const serverId = mockServerId++;
  const mockIp = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

  console.log(`[dry-run] Would create server: ${options.name} (${options.serverType}) in ${options.location}`);

  return {
    id: serverId,
    name: options.name,
    status: "running",
    public_net: {
      ipv4: { ip: mockIp },
      ipv6: { ip: "2001:db8::1" },
    },
  };
}

export async function getServer(_token: string, serverId: number): Promise<Server> {
  await delay(200);
  return {
    id: serverId,
    name: "mock-server",
    status: "running",
    public_net: {
      ipv4: { ip: "10.0.0.1" },
      ipv6: { ip: "2001:db8::1" },
    },
  };
}

export async function waitForServer(
  _token: string,
  serverId: number,
  _timeoutMs = 120000
): Promise<Server> {
  await delay(1000); // Simulate waiting
  return getServer(_token, serverId);
}

// SSH Key mocks

let mockSSHKeyId = 1000;

export async function getSSHKeys(_token: string): Promise<SSHKey[]> {
  await delay(200);
  return [];
}

export async function getSSHKeyByName(_token: string, _name: string): Promise<SSHKey | null> {
  await delay(100);
  return null;
}

export async function createSSHKey(
  _token: string,
  name: string,
  publicKey: string
): Promise<SSHKey> {
  await delay(300);
  console.log(`[dry-run] Would create SSH key: ${name}`);
  return {
    id: mockSSHKeyId++,
    name,
    fingerprint: "mock:fingerprint",
    public_key: publicKey,
  };
}

export async function deleteSSHKey(_token: string, _keyId: number): Promise<void> {
  await delay(200);
}

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

// Firewall mocks

let mockFirewallId = 2000;

export async function createFirewall(_token: string, name: string): Promise<Firewall> {
  await delay(300);
  console.log(`[dry-run] Would create firewall: ${name}`);
  return {
    id: mockFirewallId++,
    name,
  };
}

export async function applyFirewallToServer(
  _token: string,
  _firewallId: number,
  _serverId: number
): Promise<void> {
  await delay(200);
  console.log(`[dry-run] Would apply firewall to server`);
}

export async function getFirewallByName(_token: string, _name: string): Promise<Firewall | null> {
  await delay(100);
  return null;
}

export async function ensureFirewall(token: string, name: string): Promise<Firewall> {
  const existing = await getFirewallByName(token, name);
  if (existing) {
    return existing;
  }
  return createFirewall(token, name);
}
