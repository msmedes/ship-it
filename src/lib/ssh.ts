/**
 * SSH key management for ship-it.
 * Generates and manages deploy keys for server access.
 */

import { $ } from "bun";
import { mkdir, readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

const KEYS_DIR = join(homedir(), ".config", "ship-it", "keys");

export interface SSHKeyPair {
  name: string;
  publicKey: string;
  privateKeyPath: string;
}

/**
 * Generate a new SSH key pair for a project/server.
 */
export async function generateSSHKey(name: string): Promise<SSHKeyPair> {
  await mkdir(KEYS_DIR, { recursive: true });

  const privateKeyPath = join(KEYS_DIR, name);
  const publicKeyPath = `${privateKeyPath}.pub`;

  // Check if private key already exists
  let privateKeyExists = false;
  try {
    await access(privateKeyPath);
    privateKeyExists = true;
  } catch {
    // Key doesn't exist
  }

  if (privateKeyExists) {
    // Try to read existing public key
    try {
      const publicKey = await readFile(publicKeyPath, "utf-8");
      return {
        name,
        publicKey: publicKey.trim(),
        privateKeyPath,
      };
    } catch {
      // Public key missing - regenerate it from private key
      try {
        const result = await $`ssh-keygen -y -f ${privateKeyPath}`.quiet();
        if (result.exitCode !== 0) {
          throw new Error(`Failed to extract public key: ${result.stderr.toString()}`);
        }
        const publicKey = result.stdout.toString().trim();
        await writeFile(publicKeyPath, publicKey + "\n");
        return {
          name,
          publicKey,
          privateKeyPath,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read existing SSH key: ${msg}`);
      }
    }
  }

  // Generate new key pair (use Bun.spawn because shell template mishandles empty passphrase)
  const proc = Bun.spawn(
    ["ssh-keygen", "-t", "ed25519", "-f", privateKeyPath, "-N", "", "-C", `ship-it-${name}`],
    { stdout: "pipe", stderr: "pipe" }
  );
  await proc.exited;

  if (proc.exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ssh-keygen failed: ${stderr.trim() || 'exit code ' + proc.exitCode}`);
  }

  const publicKey = await readFile(publicKeyPath, "utf-8");

  return {
    name,
    publicKey: publicKey.trim(),
    privateKeyPath,
  };
}

/**
 * Get an existing SSH key pair.
 */
export async function getSSHKey(name: string): Promise<SSHKeyPair | null> {
  const privateKeyPath = join(KEYS_DIR, name);
  const publicKeyPath = `${privateKeyPath}.pub`;

  try {
    await access(privateKeyPath);
    const publicKey = await readFile(publicKeyPath, "utf-8");
    return {
      name,
      publicKey: publicKey.trim(),
      privateKeyPath,
    };
  } catch {
    return null;
  }
}

/**
 * Run SSH command on remote server.
 */
export async function ssh(
  ip: string,
  command: string,
  privateKeyPath: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await $`ssh -i ${privateKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@${ip} ${command}`.nothrow().quiet();
  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    exitCode: result.exitCode,
  };
}

/**
 * Run SSH command and throw on failure with detailed error.
 * Streams output to console in real-time.
 */
export async function sshExec(
  ip: string,
  command: string,
  privateKeyPath: string
): Promise<void> {
  console.log(`\n$ ssh root@${ip} "${command.slice(0, 60)}${command.length > 60 ? '...' : ''}"`);

  const proc = Bun.spawn(
    ["ssh", "-i", privateKeyPath, "-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", `root@${ip}`, command],
    {
      stdout: "inherit",
      stderr: "inherit",
    }
  );

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command exited with code ${exitCode}`);
  }
}

/**
 * Copy file to remote server via SCP.
 */
export async function scp(
  localPath: string,
  remotePath: string,
  ip: string,
  privateKeyPath: string
): Promise<void> {
  await $`scp -i ${privateKeyPath} -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${localPath} root@${ip}:${remotePath}`;
}

/**
 * Wait for SSH to become available on a server.
 */
export async function waitForSSH(
  ip: string,
  privateKeyPath: string,
  timeoutMs = 180000
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await ssh(ip, "echo ok", privateKeyPath);
      if (result.exitCode === 0) {
        return;
      }
    } catch {
      // SSH not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`SSH connection to ${ip} timed out after ${timeoutMs / 1000}s`);
}
