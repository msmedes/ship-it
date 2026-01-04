import { $ } from "bun";

export interface KamalInitOptions {
  serverIp: string;
  projectName: string;
  repoUrl: string;
}

/**
 * Initialize Kamal on a remote server.
 *
 * This will:
 * 1. SSH into the server
 * 2. Install Docker if needed
 * 3. Clone the repository
 * 4. Run kamal init
 */
export async function initKamal(options: KamalInitOptions): Promise<void> {
  const { serverIp, projectName, repoUrl } = options;

  // Wait for SSH to be available
  await waitForSsh(serverIp);

  // Install Docker on the server
  await installDocker(serverIp);

  // Clone the repository
  await cloneRepo(serverIp, repoUrl, projectName);

  // TODO: Generate kamal config, run kamal init, etc.
}

async function waitForSsh(ip: string, timeoutMs = 120000): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await $`ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no root@${ip} echo "ok"`.quiet();
      if (result.exitCode === 0) {
        return;
      }
    } catch {
      // SSH not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  throw new Error("SSH connection timed out");
}

async function installDocker(ip: string): Promise<void> {
  const script = `
    if ! command -v docker &> /dev/null; then
      curl -fsSL https://get.docker.com | sh
    fi
  `;

  await $`ssh -o StrictHostKeyChecking=no root@${ip} ${script}`;
}

async function cloneRepo(ip: string, repoUrl: string, projectName: string): Promise<void> {
  await $`ssh -o StrictHostKeyChecking=no root@${ip} git clone ${repoUrl} /opt/${projectName}`;
}

/**
 * Run a kamal command locally (assumes kamal is installed)
 */
export async function runKamal(
  command: string,
  args: string[] = []
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await $`kamal ${command} ${args}`.quiet();
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

/**
 * Check if kamal is installed locally
 */
export async function isKamalInstalled(): Promise<boolean> {
  try {
    const result = await $`which kamal`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
