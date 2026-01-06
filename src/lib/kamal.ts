/**
 * Kamal deployment orchestration.
 * Handles server setup and deployment via Kamal.
 */

import { $ } from "bun";
import { ssh, sshExec, waitForSSH, type SSHKeyPair } from "./ssh.js";

export interface ServerSetupOptions {
  serverIp: string;
  sshKey: SSHKeyPair;
  projectName: string;
}

export interface SetupProgress {
  step: string;
  status: "pending" | "running" | "done" | "error";
  message?: string;
}

export type ProgressCallback = (progress: SetupProgress) => void;

/**
 * Full server setup: Docker, dependencies, etc.
 */
export async function setupServer(
  options: ServerSetupOptions,
  onProgress?: ProgressCallback
): Promise<void> {
  const { serverIp, sshKey, projectName } = options;
  const report = (step: string, status: SetupProgress["status"], message?: string) => {
    onProgress?.({ step, status, message });
  };

  // Helper to run step with context in error
  async function runSetupStep(name: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${name}: ${msg}`);
    }
  }

  // Wait for SSH
  report("ssh", "running", "Waiting for SSH...");
  await runSetupStep("Waiting for SSH", () => waitForSSH(serverIp, sshKey.privateKeyPath));
  report("ssh", "done", "SSH connected");

  // Update system
  report("update", "running", "Updating system packages...");
  await runSetupStep("Updating system", () =>
    sshExec(serverIp, "DEBIAN_FRONTEND=noninteractive apt-get update && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y", sshKey.privateKeyPath)
  );
  report("update", "done");

  // Install Docker
  report("docker", "running", "Installing Docker...");
  const dockerCheck = await ssh(serverIp, "which docker", sshKey.privateKeyPath);
  if (dockerCheck.exitCode !== 0) {
    await runSetupStep("Installing Docker", () =>
      sshExec(serverIp, "curl -fsSL https://get.docker.com | sh", sshKey.privateKeyPath)
    );
  }
  report("docker", "done", "Docker installed");

  // Install additional dependencies
  report("deps", "running", "Installing dependencies...");
  await runSetupStep("Installing dependencies", () =>
    sshExec(serverIp, "DEBIAN_FRONTEND=noninteractive apt-get install -y git curl", sshKey.privateKeyPath)
  );
  report("deps", "done");

  // Create app directory
  report("dirs", "running", "Creating directories...");
  await ssh(serverIp, `mkdir -p /opt/${projectName}`, sshKey.privateKeyPath);
  report("dirs", "done");
}

/**
 * Check if kamal is installed locally.
 */
export async function isKamalInstalled(): Promise<boolean> {
  try {
    const result = await $`which kamal`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Install kamal locally via gem.
 */
export async function installKamal(): Promise<void> {
  await $`gem install kamal`;
}

/**
 * Run kamal init to create initial config files.
 */
export async function kamalInit(projectPath: string): Promise<void> {
  const proc = Bun.spawn(["kamal", "init"], {
    cwd: projectPath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(`kamal init failed:\n${output || "(no output)"}`);
  }
}

/**
 * Run kamal setup (first-time deployment).
 */
export async function kamalSetup(projectPath: string): Promise<void> {
  const proc = Bun.spawn(["kamal", "setup"], {
    cwd: projectPath,
    stdout: "pipe",
    stderr: "pipe",
  });

  // Collect output for error reporting
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(`kamal setup failed:\n${output || "(no output)"}`);
  }
}

/**
 * Run kamal deploy.
 */
export async function kamalDeploy(projectPath: string): Promise<void> {
  console.log("\n$ kamal deploy");
  const proc = Bun.spawn(["kamal", "deploy"], {
    cwd: projectPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`kamal deploy exited with code ${exitCode}`);
  }
}

/**
 * Run kamal envify to push secrets.
 */
export async function kamalEnvify(projectPath: string): Promise<void> {
  console.log("\n$ kamal envify");
  const proc = Bun.spawn(["kamal", "envify"], {
    cwd: projectPath,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`kamal envify exited with code ${exitCode}`);
  }
}

/**
 * Full deployment flow:
 * 1. Check/install kamal locally
 * 2. Setup server (if needed)
 * 3. Run kamal setup or deploy
 */
export async function deploy(
  projectPath: string,
  serverIp: string,
  sshKey: SSHKeyPair,
  options: {
    firstTime?: boolean;
    onProgress?: ProgressCallback;
  } = {}
): Promise<void> {
  const { firstTime = true, onProgress } = options;
  const report = (step: string, status: SetupProgress["status"], message?: string) => {
    onProgress?.({ step, status, message });
  };

  // Check kamal is installed
  report("kamal-check", "running", "Checking kamal installation...");
  const hasKamal = await isKamalInstalled();
  if (!hasKamal) {
    report("kamal-install", "running", "Installing kamal...");
    await installKamal();
    report("kamal-install", "done");
  }
  report("kamal-check", "done");

  // Push secrets
  report("envify", "running", "Pushing secrets...");
  await kamalEnvify(projectPath);
  report("envify", "done");

  // Run kamal
  if (firstTime) {
    report("kamal-setup", "running", "Running kamal setup...");
    await kamalSetup(projectPath);
    report("kamal-setup", "done");
  } else {
    report("kamal-deploy", "running", "Running kamal deploy...");
    await kamalDeploy(projectPath);
    report("kamal-deploy", "done");
  }
}

/**
 * Get deployment status/logs.
 */
export async function kamalLogs(projectPath: string, lines = 100): Promise<string> {
  const result = await $`kamal app logs -n ${lines}`.cwd(projectPath).quiet();
  return result.stdout.toString();
}

/**
 * Get running containers info.
 */
export async function kamalDetails(projectPath: string): Promise<string> {
  const result = await $`kamal details`.cwd(projectPath).quiet();
  return result.stdout.toString();
}

/**
 * Legacy init function for backward compatibility with TUI.
 * TODO: Remove once TUI is updated to use fullDeploy.
 */
export interface InitKamalOptions {
  serverIp: string;
  projectName: string;
  repoUrl: string;
}

export async function initKamal(_options: InitKamalOptions): Promise<void> {
  // This is a stub - the TUI will be refactored to use the new deploy flow
  // For now, just simulate the old behavior
  console.log("[stub] initKamal called - TUI needs refactoring to use fullDeploy");
}
