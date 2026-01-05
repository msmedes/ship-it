import { writeFile, readFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const CLEANUP_FILE = join(tmpdir(), "ship-it-cleanup.json");

interface CleanupState {
  hetznerToken: string | null;
  serverIds: number[];
}

let state: CleanupState = {
  hetznerToken: null,
  serverIds: [],
};

let cleanupRegistered = false;

/**
 * Initialize cleanup tracking for dev mode.
 * Sets up signal handlers to delete servers on exit.
 */
export async function initCleanup(hetznerToken: string): Promise<void> {
  state.hetznerToken = hetznerToken;

  // Try to recover any orphaned servers from previous crash
  await recoverOrphanedServers();

  if (!cleanupRegistered) {
    cleanupRegistered = true;

    // Handle graceful shutdown
    process.on("SIGINT", handleExit);
    process.on("SIGTERM", handleExit);
    process.on("exit", handleSyncExit);

    // Handle uncaught errors
    process.on("uncaughtException", async (err) => {
      console.error("\nUncaught exception:", err.message);
      await runCleanup();
      process.exit(1);
    });

    process.on("unhandledRejection", async (err) => {
      console.error("\nUnhandled rejection:", err);
      await runCleanup();
      process.exit(1);
    });
  }
}

/**
 * Track a server for cleanup.
 */
export async function trackServer(serverId: number): Promise<void> {
  console.log(`[dev mode] Tracking server ${serverId} for cleanup`);
  state.serverIds.push(serverId);
  await persistState();
}

/**
 * Remove a server from tracking (if user wants to keep it).
 */
export async function untrackServer(serverId: number): Promise<void> {
  state.serverIds = state.serverIds.filter((id) => id !== serverId);
  await persistState();
}

/**
 * Get list of tracked servers.
 */
export function getTrackedServers(): number[] {
  return [...state.serverIds];
}

/**
 * Run cleanup - delete all tracked servers.
 */
export async function runCleanup(): Promise<void> {
  if (state.serverIds.length === 0 || !state.hetznerToken) {
    return;
  }

  console.log(`\n[dev mode] Cleaning up ${state.serverIds.length} server(s)...`);

  for (const serverId of state.serverIds) {
    try {
      const response = await fetch(
        `https://api.hetzner.cloud/v1/servers/${serverId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${state.hetznerToken}`,
          },
        }
      );

      if (response.ok) {
        console.log(`  Deleted server ${serverId}`);
      } else {
        const data = await response.json();
        console.error(`  Failed to delete server ${serverId}: ${data.error?.message}`);
      }
    } catch (err) {
      console.error(`  Error deleting server ${serverId}:`, err);
    }
  }

  state.serverIds = [];
  await clearPersistedState();
}

async function handleExit(): Promise<void> {
  console.log("\n[dev mode] Caught exit signal, cleaning up...");
  await runCleanup();
  process.exit(0);
}

function handleSyncExit(): void {
  // Can't do async cleanup here, but we've persisted state to disk
  // so next run can recover orphaned servers
  if (state.serverIds.length > 0) {
    console.log(
      `\n[dev mode] Warning: ${state.serverIds.length} server(s) may not have been cleaned up.`
    );
    console.log(`Run ship-it --dev again to clean them up.`);
  }
}

async function persistState(): Promise<void> {
  try {
    await writeFile(CLEANUP_FILE, JSON.stringify(state, null, 2));
  } catch {
    // Ignore errors - best effort
  }
}

async function clearPersistedState(): Promise<void> {
  try {
    await unlink(CLEANUP_FILE);
  } catch {
    // Ignore errors - file may not exist
  }
}

async function recoverOrphanedServers(): Promise<void> {
  try {
    const content = await readFile(CLEANUP_FILE, "utf-8");
    const persisted = JSON.parse(content) as CleanupState;

    if (persisted.serverIds.length > 0 && state.hetznerToken) {
      console.log(
        `[dev mode] Found ${persisted.serverIds.length} orphaned server(s) from previous run.`
      );

      // Merge with current state
      for (const id of persisted.serverIds) {
        if (!state.serverIds.includes(id)) {
          state.serverIds.push(id);
        }
      }

      // Clean them up immediately
      await runCleanup();
    }
  } catch {
    // No file or invalid - ignore
  }
}
