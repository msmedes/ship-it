/**
 * Non-interactive runner for CLI mode.
 * Handles --list-locations, --list-types, and full provisioning.
 */

import type { CliOptions } from "./cli.js";
import type { HetznerClient } from "./hetzner-context.js";
import * as realHetzner from "./hetzner.js";
import * as mockHetzner from "./hetzner-mock.js";
import { loadConfig } from "./config.js";
import { initCleanup, trackServer } from "./cleanup.js";
import { initKamal } from "./kamal.js";

export async function runNonInteractive(options: CliOptions): Promise<void> {
  const client: HetznerClient =
    options.mode === "dry-run" ? mockHetzner : realHetzner;

  // Get token from options, env, or config
  let token = options.token;
  if (!token) {
    const config = await loadConfig();
    token = config.hetznerToken;
  }

  // Use mock token in dry-run mode if none provided
  if (!token && options.mode === "dry-run") {
    token = "dry-run-mock-token";
  }

  if (options.listLocations) {
    await listLocations(client, token);
    return;
  }

  if (options.listTypes) {
    await listTypes(client, token, options.location);
    return;
  }

  // Full provisioning flow
  await provision(client, token!, options);
}

async function listLocations(client: HetznerClient, token?: string): Promise<void> {
  if (!token) {
    console.log("Note: Using mock data. Provide --token for real locations.\n");
    token = "mock-token";
  }

  console.log("Available Hetzner locations:\n");

  const locations = await client.getLocations(token);

  // Group by region
  const regions = new Map<string, typeof locations>();
  for (const loc of locations) {
    const region =
      loc.country === "US"
        ? "Americas"
        : loc.country === "SG"
          ? "Asia Pacific"
          : "Europe";
    if (!regions.has(region)) {
      regions.set(region, []);
    }
    regions.get(region)!.push(loc);
  }

  for (const [region, locs] of regions) {
    console.log(`${region}:`);
    for (const loc of locs) {
      console.log(`  ${loc.name.padEnd(6)} ${loc.city}, ${loc.country}`);
    }
    console.log();
  }
}

async function listTypes(
  client: HetznerClient,
  token?: string,
  location?: string
): Promise<void> {
  if (!token) {
    console.log("Note: Using mock data. Provide --token for real pricing.\n");
    token = "mock-token";
  }

  const pricingLocation = location || "fsn1";
  console.log(`Available server types (pricing for ${pricingLocation}):\n`);

  const types = await client.getServerTypes(token);

  // Filter to shared CPU types
  const sharedTypes = types.filter(
    (t) =>
      t.name.startsWith("cx") ||
      t.name.startsWith("cpx") ||
      t.name.startsWith("cax")
  );

  console.log("TYPE     VCPU   RAM   DISK    PRICE/MO");
  console.log("─".repeat(42));

  for (const t of sharedTypes) {
    const price = t.prices.find((p) => p.location === pricingLocation);
    const priceStr = price ? `€${price.price_monthly.gross}` : "N/A";

    console.log(
      `${t.name.padEnd(8)} ${String(t.cores).padStart(3)}   ${String(t.memory).padStart(3)}GB  ${String(t.disk).padStart(4)}GB   ${priceStr}`
    );
  }

  console.log();
  if (!location) {
    console.log("Tip: Use --location <loc> to see pricing for a specific region");
  }
}

async function provision(
  client: HetznerClient,
  token: string,
  options: CliOptions
): Promise<void> {
  const { serverName, location, serverType, projectName, repoUrl, mode } = options;

  console.log("ship-it - Non-interactive provisioning\n");

  if (mode === "dry-run") {
    console.log("[dry-run] Using mock Hetzner API\n");
  } else if (mode === "dev") {
    console.log("[dev] Servers will be cleaned up on exit\n");
    await initCleanup(token);
  }

  // Step 1: Validate token
  process.stdout.write("Validating Hetzner token... ");
  const validation = await client.validateHetznerToken(token);
  if (!validation.valid) {
    console.log("FAILED");
    console.error(`Error: ${validation.error}`);
    process.exit(1);
  }
  console.log("OK");

  // Step 2: Create server
  process.stdout.write(`Creating server "${serverName}" (${serverType}) in ${location}... `);
  try {
    const server = await client.createServer(token, {
      name: serverName!,
      serverType: serverType!,
      location: location!,
    });

    console.log("OK");
    console.log(`  Server ID: ${server.id}`);
    console.log(`  IP: ${server.public_net.ipv4.ip}`);

    if (mode === "dev") {
      await trackServer(server.id);
    }

    // Step 3: Wait for server (if not dry-run, we'd wait for SSH)
    if (projectName && repoUrl) {
      console.log(`\nProject: ${projectName}`);
      console.log(`Repo: ${repoUrl}`);

      if (mode !== "dry-run") {
        process.stdout.write("Waiting for server to be ready... ");
        await client.waitForServer(token, server.id);
        console.log("OK");

        process.stdout.write("Initializing Kamal... ");
        try {
          await initKamal({
            serverIp: server.public_net.ipv4.ip,
            projectName: projectName,
            repoUrl: repoUrl,
          });
          console.log("OK");
        } catch (err) {
          console.log("FAILED");
          console.error(`Error: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        console.log("[dry-run] Would initialize Kamal on server");
      }
    }

    console.log("\nDone!");
    console.log(`\nServer IP: ${server.public_net.ipv4.ip}`);

    if (mode === "dev") {
      console.log("\n[dev] Press Ctrl+C to clean up and exit");
      // Keep process alive so cleanup handlers work
      await new Promise(() => {});
    }
  } catch (err) {
    console.log("FAILED");
    console.error(`Error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
