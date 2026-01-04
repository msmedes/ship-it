import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  validateHetznerToken,
  getServerTypes,
  getLocations,
  createServer,
  getServer,
  waitForServer,
} from "./hetzner";
import {
  mockServerTypes,
  mockLocations,
  mockServer,
  mockServerRunning,
  mockServersEmpty,
  mockError,
} from "./__mocks__/hetzner-responses";

// Store original fetch
const originalFetch = globalThis.fetch;

// Helper to mock fetch
function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    const urlStr = url.toString();

    for (const [pattern, response] of Object.entries(responses)) {
      if (urlStr.includes(pattern)) {
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: { message: "Not found" } }), {
      status: 404,
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  // Reset fetch before each test
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("validateHetznerToken", () => {
  it("returns valid: true for a valid token", async () => {
    mockFetch({
      "/servers": { status: 200, body: mockServersEmpty },
    });

    const result = await validateHetznerToken("valid-token");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid: false for an invalid token", async () => {
    mockFetch({
      "/servers": { status: 401, body: mockError },
    });

    const result = await validateHetznerToken("invalid-token");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("Invalid API token");
  });
});

describe("getServerTypes", () => {
  it("returns sorted server types", async () => {
    mockFetch({
      "/server_types": { status: 200, body: mockServerTypes },
    });

    const types = await getServerTypes("valid-token");

    expect(types.length).toBe(3);
    // Should be sorted by cores
    expect(types[0].cores).toBeLessThanOrEqual(types[1].cores);
  });

  it("includes pricing information", async () => {
    mockFetch({
      "/server_types": { status: 200, body: mockServerTypes },
    });

    const types = await getServerTypes("valid-token");
    const cx22 = types.find(t => t.name === "cx22");

    expect(cx22).toBeDefined();
    expect(cx22!.prices.length).toBeGreaterThan(0);
    expect(cx22!.prices[0].price_monthly.gross).toBe("4.35");
  });
});

describe("getLocations", () => {
  it("returns all locations", async () => {
    mockFetch({
      "/locations": { status: 200, body: mockLocations },
    });

    const locations = await getLocations("valid-token");

    expect(locations.length).toBe(6);
    expect(locations.map(l => l.country)).toContain("US");
    expect(locations.map(l => l.country)).toContain("DE");
    expect(locations.map(l => l.country)).toContain("SG");
  });
});

describe("createServer", () => {
  it("creates a server and returns server details", async () => {
    mockFetch({
      "/servers": { status: 201, body: mockServer },
    });

    const server = await createServer("valid-token", {
      name: "test-server",
      serverType: "cx22",
      location: "ash",
    });

    expect(server.id).toBe(12345);
    expect(server.name).toBe("test-server");
    expect(server.public_net.ipv4.ip).toBe("1.2.3.4");
  });

  it("throws on API error", async () => {
    mockFetch({
      "/servers": { status: 422, body: { error: { message: "Name already taken" } } },
    });

    await expect(
      createServer("valid-token", {
        name: "existing-server",
        serverType: "cx22",
        location: "ash",
      })
    ).rejects.toThrow("Name already taken");
  });
});

describe("getServer", () => {
  it("returns server by ID", async () => {
    mockFetch({
      "/servers/12345": { status: 200, body: mockServerRunning },
    });

    const server = await getServer("valid-token", 12345);

    expect(server.id).toBe(12345);
    expect(server.status).toBe("running");
  });
});

describe("waitForServer", () => {
  it("returns when server is running", async () => {
    let callCount = 0;
    globalThis.fetch = mock(async () => {
      callCount++;
      const body = callCount >= 2 ? mockServerRunning : mockServer;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const server = await waitForServer("valid-token", 12345, 10000);

    expect(server.status).toBe("running");
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("throws on timeout", async () => {
    mockFetch({
      "/servers/12345": { status: 200, body: mockServer }, // Always "initializing"
    });

    await expect(
      waitForServer("valid-token", 12345, 100) // Very short timeout
    ).rejects.toThrow("Server creation timed out");
  });
});
