/**
 * Main deployment orchestrator.
 * Ties together all the pieces: Hetzner, SSH, Kamal, project config.
 */

import { generateSSHKey, waitForSSH, type SSHKeyPair } from "./ssh.js";
import * as realHetzner from "./hetzner.js";
import * as mockHetzner from "./hetzner-mock.js";
import { kamalInit, kamalSetup, isKamalInstalled } from "./kamal.js";
import { trackServer } from "./cleanup.js";
import {
  detectProject,
  generateDockerfile,
  modifyDeployYml,
  writeKamalSecrets,
  type ProjectInfo,
} from "./project.js";
import { saveDeployment } from "./storage.js";
import type { ProjectDeployment } from "./types.js";
import type { RunMode } from "./cli.js";
import type { Config } from "./config.js";

export interface DeployOptions {
  config: Config;
  serverName: string;
  location: string;
  serverType: string;
  projectPath?: string;
  domain?: string;
  mode?: RunMode;
}

export interface DeployResult {
  serverIp: string;
  serverId: number;
  domain: string;
  projectInfo: ProjectInfo;
}

export interface DeployStep {
  id: string;
  name: string;
  status: "pending" | "running" | "done" | "error";
  message?: string;
}

export type DeployProgressCallback = (steps: DeployStep[]) => void;

const STEPS: Array<{ id: string; name: string }> = [
  { id: "detect", name: "Detecting project" },
  { id: "ssh-key", name: "Setting up SSH key" },
  { id: "firewall", name: "Creating firewall" },
  { id: "server", name: "Provisioning server" },
  { id: "wait", name: "Waiting for server" },
  { id: "ssh-wait", name: "Waiting for SSH" },
  { id: "dockerfile", name: "Generating Dockerfile" },
  { id: "kamal-check", name: "Checking Kamal" },
  { id: "kamal-init", name: "Configuring Kamal" },
  { id: "git-commit", name: "Committing config" },
  { id: "kamal-setup", name: "Running Kamal setup" },
];

/**
 * Full deployment flow from zero to deployed.
 */
export async function fullDeploy(
  options: DeployOptions,
  onProgress?: DeployProgressCallback
): Promise<DeployResult> {
  const {
    config,
    serverName,
    location,
    serverType,
    projectPath = process.cwd(),
    domain,
    mode = "production",
  } = options;

  const hetznerToken = config.hetznerToken!;
  const registry = config.registry;

  // Select Hetzner client based on mode
  const hetzner = mode === "dry-run" ? mockHetzner : realHetzner;
  const isDryRun = mode === "dry-run";

  // Initialize steps
  const steps: DeployStep[] = STEPS.map((s) => ({
    ...s,
    status: "pending" as const,
  }));

  const updateStep = (id: string, status: DeployStep["status"], message?: string) => {
    const step = steps.find((s) => s.id === id);
    if (step) {
      step.status = status;
      step.message = message;
      onProgress?.(steps);
    }
  };

  // Helper to run a step with error handling
  async function runStep<T>(
    stepId: string,
    fn: () => Promise<T>,
    successMessage?: string | ((result: T) => string)
  ): Promise<T> {
    updateStep(stepId, "running");
    try {
      const result = await fn();
      const message = typeof successMessage === "function"
        ? successMessage(result)
        : successMessage;
      updateStep(stepId, "done", message);
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      updateStep(stepId, "error", errorMsg);
      const stepName = steps.find((s) => s.id === stepId)?.name || stepId;
      throw new Error(`${stepName}: ${errorMsg}`);
    }
  }

  // Step 1: Detect project
  const projectInfo = await runStep(
    "detect",
    () => detectProject(projectPath),
    (info) => `Detected ${info.type} project`
  );

  // Step 2: Generate SSH key
  const sshKeyName = `ship-it-${serverName}`;
  let localKey: SSHKeyPair;
  if (isDryRun) {
    localKey = {
      name: sshKeyName,
      publicKey: "ssh-ed25519 MOCK_KEY ship-it-dry-run",
      privateKeyPath: "/tmp/mock-key",
    };
    updateStep("ssh-key", "done", "[dry-run]");
  } else {
    localKey = await runStep("ssh-key", async () => {
      const key = await generateSSHKey(sshKeyName);
      await hetzner.ensureSSHKey(hetznerToken, sshKeyName, key.publicKey);
      return key;
    });
  }

  // Step 3: Create firewall
  const firewallName = `ship-it-${serverName}`;
  const firewall = await runStep(
    "firewall",
    () => hetzner.ensureFirewall(hetznerToken, firewallName)
  );

  // Step 4: Create server
  const server = await runStep(
    "server",
    async () => {
      const s = await hetzner.createServer(hetznerToken, {
        name: serverName,
        serverType,
        location,
        sshKeyName,
      });
      // Track server for cleanup in dev mode
      if (mode === "dev") {
        await trackServer(s.id);
      }
      return s;
    },
    (s) => `Server ID: ${s.id}`
  );

  // Step 5: Wait for server to be running (needed before applying firewall)
  const readyServer = await runStep(
    "wait",
    () => hetzner.waitForServer(hetznerToken, server.id),
    (s) => `IP: ${s.public_net.ipv4.ip}`
  );
  const serverIp = readyServer.public_net.ipv4.ip;

  // Apply firewall to server (after it's running and has network interfaces)
  try {
    await hetzner.applyFirewallToServer(hetznerToken, firewall.id, server.id);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Applying firewall to server: ${errorMsg}`);
  }

  // Step 6: Wait for SSH to be available
  if (isDryRun) {
    updateStep("ssh-wait", "done", "[dry-run] Skipped");
  } else {
    await runStep(
      "ssh-wait",
      () => waitForSSH(serverIp, localKey.privateKeyPath),
      "SSH ready"
    );
  }

  // Step 7: Generate Dockerfile if needed
  if (!projectInfo.hasDockerfile) {
    if (isDryRun) {
      updateStep("dockerfile", "done", "[dry-run] Would generate");
    } else {
      await runStep(
        "dockerfile",
        () => generateDockerfile(projectInfo),
        "Generated"
      );
    }
  } else {
    updateStep("dockerfile", "done", "Using existing Dockerfile");
  }

  // Step 7: Check Kamal is installed locally
  if (isDryRun) {
    updateStep("kamal-check", "done", "[dry-run] Skipped");
  } else {
    await runStep("kamal-check", async () => {
      const hasKamal = await isKamalInstalled();
      if (!hasKamal) {
        throw new Error("Kamal not installed. Run: gem install kamal");
      }
    });
  }

  // Step 8: Run kamal init and modify deploy.yml
  if (isDryRun) {
    updateStep("kamal-init", "done", "[dry-run] Skipped");
  } else {
    await runStep("kamal-init", async () => {
      // Run kamal init to create config stubs
      await kamalInit(projectPath);
      // Modify deploy.yml with our server details and registry
      await modifyDeployYml(projectPath, serverIp, {
        domain,
        sshKeyPath: localKey.privateKeyPath,
        registry: registry ? {
          server: registry.server,
          username: registry.username,
        } : undefined,
        port: projectInfo.port,
      });
      // Write .kamal/secrets with registry password
      if (registry) {
        await writeKamalSecrets(projectPath, registry.password);
      }
    });
  }

  // Step 9: Commit config files (Kamal needs a git commit to tag deploys)
  if (isDryRun) {
    updateStep("git-commit", "done", "[dry-run] Skipped");
  } else {
    await runStep("git-commit", async () => {
      // Add all kamal-related files
      const addProc = Bun.spawn(["git", "add", "config/", ".kamal/", "Dockerfile"], {
        cwd: projectPath,
        stdout: "inherit",
        stderr: "inherit",
      });
      await addProc.exited;

      // Commit
      const commitProc = Bun.spawn(
        ["git", "commit", "-m", "Configure Kamal deployment\n\nGenerated by ship-it"],
        {
          cwd: projectPath,
          stdout: "inherit",
          stderr: "inherit",
        }
      );
      const exitCode = await commitProc.exited;
      if (exitCode !== 0) {
        throw new Error("git commit failed");
      }
    });
  }

  // Step 10: Run Kamal setup (installs Docker, builds, deploys)
  if (isDryRun) {
    updateStep("kamal-setup", "done", "[dry-run] Skipped");
  } else {
    // Add host entry to ~/.ssh/config to disable strict host key checking
    // (Kamal's Net::SSH fails on host key mismatch with fresh servers)
    const { appendFile, readFile, mkdir } = await import("fs/promises");
    const { join } = await import("path");
    const { homedir } = await import("os");

    const sshDir = join(homedir(), ".ssh");
    const sshConfigPath = join(sshDir, "config");

    // Ensure .ssh directory exists
    await mkdir(sshDir, { recursive: true, mode: 0o700 });

    // Check if we already have an entry for this host
    let existingConfig = "";
    try {
      existingConfig = await readFile(sshConfigPath, "utf-8");
    } catch {
      // File doesn't exist
    }

    // Add entry if not already present
    const hostEntry = `\n# Added by ship-it for ${serverIp}\nHost ${serverIp}\n  StrictHostKeyChecking no\n  UserKnownHostsFile /dev/null\n`;
    if (!existingConfig.includes(`Host ${serverIp}`)) {
      await appendFile(sshConfigPath, hostEntry);
    }

    await runStep(
      "kamal-setup",
      () => kamalSetup(projectPath)
    );
  }

  const finalDomain = domain || `${serverIp}.nip.io`;

  // Persist deployment for dashboard
  const deployment: ProjectDeployment = {
    id: crypto.randomUUID(),
    projectPath,
    projectName: projectInfo.name,
    serverId: server.id,
    serverIp,
    serverName,
    domain: finalDomain,
    createdAt: new Date().toISOString(),
    lastDeployedAt: new Date().toISOString(),
    status: "running",
  };
  await saveDeployment(deployment);

  return {
    serverIp,
    serverId: server.id,
    domain: finalDomain,
    projectInfo,
  };
}

/**
 * Quick status check - is this project already deployed?
 */
export async function isDeployed(projectPath: string = process.cwd()): Promise<boolean> {
  try {
    const { access } = await import("fs/promises");
    const { join } = await import("path");
    await access(join(projectPath, "config", "deploy.yml"));
    await access(join(projectPath, ".kamal", "secrets"));
    return true;
  } catch {
    return false;
  }
}
