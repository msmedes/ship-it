import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import Spinner from "ink-spinner";
import { useHetzner } from "../../lib/hetzner-context.js";
import { loadConfig, saveConfig, getConfigPath } from "../../lib/config.js";

interface HetznerSetupProps {
  onNext: (token: string) => void;
  onBack: () => void;
}

type Status = "loading" | "found-token" | "input" | "validating" | "save-prompt" | "error";

export function HetznerSetup({ onNext, onBack }: HetznerSetupProps) {
  const { client } = useHetzner();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [foundToken, setFoundToken] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape && status !== "validating") {
      onBack();
    }
  });

  useEffect(() => {
    async function checkConfig() {
      const config = await loadConfig();
      if (config.hetznerToken) {
        setFoundToken(config.hetznerToken);
        setStatus("found-token");
      } else {
        setStatus("input");
      }
    }
    checkConfig();
  }, []);

  const handleUseExisting = async (item: { value: string }) => {
    if (item.value === "use") {
      setStatus("validating");
      const result = await client.validateHetznerToken(foundToken!);
      if (result.valid) {
        onNext(foundToken!);
      } else {
        setError("Saved token is invalid or expired");
        setStatus("input");
        setFoundToken(null);
      }
    } else {
      setStatus("input");
    }
  };

  const handleSubmit = async (value: string) => {
    if (!value.trim()) return;

    setStatus("validating");
    setError(null);

    const result = await client.validateHetznerToken(value);

    if (result.valid) {
      setToken(value);
      setStatus("save-prompt");
    } else {
      setStatus("error");
      setError(result.error || "Invalid token");
    }
  };

  const handleSaveChoice = async (item: { value: string }) => {
    if (item.value === "save") {
      await saveConfig({ hetznerToken: token });
    }
    onNext(token);
  };

  if (status === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Checking for saved credentials...</Text>
      </Box>
    );
  }

  if (status === "found-token") {
    return (
      <Box flexDirection="column">
        <Text bold>Hetzner Cloud Setup</Text>
        <Box marginTop={1}>
          <Text>Found saved Hetzner token. Use it?</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Use saved token", value: "use" },
              { label: "Enter a different token", value: "new" },
            ]}
            onSelect={handleUseExisting}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (status === "save-prompt") {
    return (
      <Box flexDirection="column">
        <Text bold>Save Token?</Text>
        <Box marginTop={1}>
          <Text dimColor>Save to {getConfigPath()}?</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Yes, save for future use", value: "save" },
              { label: "No, just use for this session", value: "skip" },
            ]}
            onSelect={handleSaveChoice}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold>Hetzner Cloud Setup</Text>
      <Box marginTop={1}>
        <Text dimColor>
          Enter your Hetzner Cloud API token. You can create one at:
        </Text>
      </Box>
      <Text color="blue">https://console.hetzner.cloud/projects/*/security/tokens</Text>

      <Box marginTop={1}>
        {status === "validating" ? (
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> Validating token...</Text>
          </Box>
        ) : (
          <Box>
            <Text>Token: </Text>
            <TextInput
              value={token}
              onChange={setToken}
              onSubmit={handleSubmit}
              mask="*"
            />
          </Box>
        )}
      </Box>

      {status === "error" && error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    </Box>
  );
}
