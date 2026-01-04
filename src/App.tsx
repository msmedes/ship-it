import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { Welcome } from "./components/steps/Welcome.js";
import { HetznerSetup } from "./components/steps/HetznerSetup.js";
import { ServerCreate } from "./components/steps/ServerCreate.js";
import { KamalInit } from "./components/steps/KamalInit.js";
import { Complete } from "./components/steps/Complete.js";
import { HetznerProvider } from "./lib/hetzner-context.js";
import { initCleanup, trackServer } from "./lib/cleanup.js";
import type { RunMode } from "./lib/cli.js";

export type WizardStep =
  | "welcome"
  | "hetzner-setup"
  | "server-create"
  | "kamal-init"
  | "complete";

export interface AppState {
  hetznerToken?: string;
  serverIp?: string;
  serverId?: number;
  projectName?: string;
  repoUrl?: string;
}

interface AppProps {
  mode: RunMode;
}

export function App({ mode }: AppProps) {
  const [step, setStep] = useState<WizardStep>("welcome");
  const [state, setState] = useState<AppState>({});

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Initialize cleanup tracking in dev mode when we have a token
  useEffect(() => {
    if (mode === "dev" && state.hetznerToken) {
      initCleanup(state.hetznerToken);
    }
  }, [mode, state.hetznerToken]);

  const handleServerCreated = async (serverIp: string, serverId: number) => {
    // Track server for cleanup in dev mode
    if (mode === "dev") {
      await trackServer(serverId);
    }
    updateState({ serverIp, serverId });
    setStep("kamal-init");
  };

  const modeLabel =
    mode === "dry-run"
      ? " [dry-run]"
      : mode === "dev"
        ? " [dev]"
        : "";

  const modeColor =
    mode === "dry-run" ? "yellow" : mode === "dev" ? "magenta" : undefined;

  return (
    <HetznerProvider mode={mode}>
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ship-it
          </Text>
          <Text dimColor> — Kamal deployment setup</Text>
          {modeLabel && <Text color={modeColor}>{modeLabel}</Text>}
        </Box>

        {mode === "dev" && (
          <Box marginBottom={1}>
            <Text color="magenta">
              Dev mode: Servers will be deleted when you exit (Ctrl+C)
            </Text>
          </Box>
        )}

        {mode === "dry-run" && (
          <Box marginBottom={1}>
            <Text color="yellow">
              Dry-run mode: No real servers will be created
            </Text>
          </Box>
        )}

        {step === "welcome" && <Welcome onNext={() => setStep("hetzner-setup")} />}

        {step === "hetzner-setup" && (
          <HetznerSetup
            onNext={(token) => {
              updateState({ hetznerToken: token });
              setStep("server-create");
            }}
            onBack={() => setStep("welcome")}
          />
        )}

        {step === "server-create" && (
          <ServerCreate
            hetznerToken={state.hetznerToken!}
            onNext={handleServerCreated}
            onBack={() => setStep("hetzner-setup")}
          />
        )}

        {step === "kamal-init" && (
          <KamalInit
            serverIp={state.serverIp!}
            onNext={(projectName, repoUrl) => {
              updateState({ projectName, repoUrl });
              setStep("complete");
            }}
            onBack={() => setStep("server-create")}
          />
        )}

        {step === "complete" && <Complete state={state} />}
      </Box>
    </HetznerProvider>
  );
}
