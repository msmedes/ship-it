import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { loadConfig, saveConfig, isConfigComplete, type Config, type RegistryConfig } from "../../lib/config.js";
import { useHetzner } from "../../lib/hetzner-context.js";

interface ConfigSetupProps {
  onNext: (config: Config) => void;
  onBack: () => void;
}

type Step = "loading" | "hetzner-token" | "hetzner-validating" | "registry-server" | "registry-username" | "registry-password" | "confirm";

const REGISTRY_OPTIONS = [
  { key: "ghcr", label: "GitHub Container Registry (ghcr.io)", value: "ghcr.io" },
  { key: "docker", label: "Docker Hub (docker.io)", value: "docker.io" },
  { key: "custom", label: "Custom registry", value: "custom" },
];

export function ConfigSetup({ onNext, onBack }: ConfigSetupProps) {
  const { client } = useHetzner();
  const [step, setStep] = useState<Step>("loading");
  const [config, setConfig] = useState<Config>({});
  const [hetznerToken, setHetznerToken] = useState("");
  const [registryServer, setRegistryServer] = useState("");
  const [registryUsername, setRegistryUsername] = useState("");
  const [registryPassword, setRegistryPassword] = useState("");
  const [customServer, setCustomServer] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      if (step === "registry-password") {
        setStep("registry-username");
      } else if (step === "registry-username") {
        setStep("registry-server");
      } else if (step === "registry-server") {
        setStep("hetzner-token");
      } else if (step === "confirm") {
        setStep("registry-password");
      } else {
        onBack();
      }
    }
  });

  useEffect(() => {
    async function load() {
      const existing = await loadConfig();
      setConfig(existing);

      if (existing.hetznerToken) {
        setHetznerToken(existing.hetznerToken);
      }
      if (existing.registry) {
        setRegistryServer(existing.registry.server);
        setRegistryUsername(existing.registry.username);
        setRegistryPassword(existing.registry.password);
      }

      const { complete } = isConfigComplete(existing);
      if (complete) {
        // Config is complete, validate and proceed
        setStep("hetzner-validating");
        const result = await client.validateHetznerToken(existing.hetznerToken!);
        if (result.valid) {
          onNext(existing);
        } else {
          setError("Saved Hetzner token is invalid");
          setStep("hetzner-token");
        }
      } else {
        setStep("hetzner-token");
      }
    }
    load();
  }, [client, onNext]);

  const handleHetznerSubmit = async (token: string) => {
    if (!token.trim()) return;

    setStep("hetzner-validating");
    setError(null);

    const result = await client.validateHetznerToken(token.trim());
    if (result.valid) {
      setHetznerToken(token.trim());
      setStep("registry-server");
    } else {
      setError(result.error || "Invalid token");
      setStep("hetzner-token");
    }
  };

  const handleRegistrySelect = (item: { value: string }) => {
    if (item.value === "custom") {
      setRegistryServer("");
      setCustomServer("");
      // Will need custom input - for now just set empty and go to username
      setStep("registry-username");
    } else {
      setRegistryServer(item.value);
      setStep("registry-username");
    }
  };

  const handleUsernameSubmit = (username: string) => {
    if (!username.trim()) return;
    setRegistryUsername(username.trim());
    setStep("registry-password");
  };

  const handlePasswordSubmit = (password: string) => {
    if (!password.trim()) return;
    setRegistryPassword(password.trim());
    setStep("confirm");
  };

  const handleConfirm = async (item: { value: string }) => {
    if (item.value === "yes") {
      const newConfig: Config = {
        hetznerToken,
        registry: {
          server: registryServer || customServer,
          username: registryUsername,
          password: registryPassword,
        },
      };
      await saveConfig(newConfig);
      onNext(newConfig);
    } else {
      setStep("hetzner-token");
    }
  };

  if (step === "loading") {
    return (
      <Box>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Text> Loading configuration...</Text>
      </Box>
    );
  }

  if (step === "hetzner-validating") {
    return (
      <Box>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Text> Validating Hetzner token...</Text>
      </Box>
    );
  }

  if (step === "hetzner-token") {
    return (
      <Box flexDirection="column">
        <Text bold>Hetzner API Token</Text>
        <Box marginTop={1}>
          <Text dimColor>Get your token from: </Text>
          <Text color="cyan">https://console.hetzner.cloud/projects/*/security/tokens</Text>
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>Token: </Text>
          <TextInput
            value={hetznerToken}
            onChange={setHetznerToken}
            onSubmit={handleHetznerSubmit}
            mask="*"
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "registry-server") {
    return (
      <Box flexDirection="column">
        <Text bold>Container Registry</Text>
        <Box marginTop={1}>
          <Text dimColor>Select your container registry:</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput items={REGISTRY_OPTIONS} onSelect={handleRegistrySelect} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "registry-username") {
    return (
      <Box flexDirection="column">
        <Text bold>Registry Username</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {registryServer === "ghcr.io"
              ? "Your GitHub username"
              : registryServer === "docker.io"
                ? "Your Docker Hub username"
                : "Registry username"}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Username: </Text>
          <TextInput
            value={registryUsername}
            onChange={setRegistryUsername}
            onSubmit={handleUsernameSubmit}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "registry-password") {
    return (
      <Box flexDirection="column">
        <Text bold>Registry Password/Token</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {registryServer === "ghcr.io"
              ? "GitHub Personal Access Token (with packages:write scope)"
              : registryServer === "docker.io"
                ? "Docker Hub Access Token"
                : "Registry password or token"}
          </Text>
        </Box>
        {registryServer === "ghcr.io" && (
          <Box marginTop={1}>
            <Text dimColor>Create at: </Text>
            <Text color="cyan">https://github.com/settings/tokens</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text>Token: </Text>
          <TextInput
            value={registryPassword}
            onChange={setRegistryPassword}
            onSubmit={handlePasswordSubmit}
            mask="*"
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "confirm") {
    return (
      <Box flexDirection="column">
        <Text bold>Confirm Configuration</Text>
        <Box marginTop={1} flexDirection="column" marginLeft={2}>
          <Text>
            <Text dimColor>Hetzner Token:</Text> {hetznerToken.slice(0, 8)}...
          </Text>
          <Text>
            <Text dimColor>Registry:</Text> {registryServer || customServer}
          </Text>
          <Text>
            <Text dimColor>Username:</Text> {registryUsername}
          </Text>
          <Text>
            <Text dimColor>Password:</Text> {"*".repeat(8)}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Save this configuration?</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { key: "yes", label: "Yes, save and continue", value: "yes" },
              { key: "no", label: "No, start over", value: "no" },
            ]}
            onSelect={handleConfirm}
          />
        </Box>
      </Box>
    );
  }

  return null;
}
