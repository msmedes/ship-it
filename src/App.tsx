import { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Welcome } from "./components/steps/Welcome.js";
import { ConfigSetup } from "./components/steps/ConfigSetup.js";
import { ServerConfig } from "./components/steps/ServerConfig.js";
import { Deploy } from "./components/steps/Deploy.js";
import { Complete } from "./components/steps/Complete.js";
import { ErrorDisplay } from "./components/steps/ErrorDisplay.js";
import { HetznerProvider } from "./lib/hetzner-context.js";
import { initCleanup, runCleanup } from "./lib/cleanup.js";
import type { RunMode } from "./lib/cli.js";
import type { Config } from "./lib/config.js";

export type WizardStep =
  | "welcome"
  | "config-setup"
  | "server-config"
  | "deploy"
  | "complete"
  | "error";

export interface AppState {
  config?: Config;
  serverName?: string;
  location?: string;
  serverType?: string;
  serverIp?: string;
  serverId?: number;
  domain?: string;
  error?: string;
}

interface AppProps {
  mode: RunMode;
}

export function App({ mode }: AppProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardStep>("welcome");
  const [state, setState] = useState<AppState>({});

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Initialize cleanup tracking in dev mode when we have a token
  useEffect(() => {
    if (mode === "dev" && state.config?.hetznerToken) {
      initCleanup(state.config.hetznerToken);
    }
  }, [mode, state.config?.hetznerToken]);

  // Handle Ctrl+C for cleanup in dev mode
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (mode === "dev") {
        // Run cleanup then exit - don't use async in useInput callback
        runCleanup().finally(() => {
          exit();
        });
      } else {
        exit();
      }
    }
  });

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
          <Text dimColor> — Deploy to Hetzner with Kamal</Text>
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

        {step === "welcome" && <Welcome onNext={() => setStep("config-setup")} />}

        {step === "config-setup" && (
          <ConfigSetup
            onNext={(config) => {
              updateState({ config });
              setStep("server-config");
            }}
            onBack={() => setStep("welcome")}
          />
        )}

        {step === "server-config" && (
          <ServerConfig
            hetznerToken={state.config!.hetznerToken!}
            onNext={(serverName, location, serverType) => {
              updateState({ serverName, location, serverType });
              setStep("deploy");
            }}
            onBack={() => setStep("config-setup")}
          />
        )}

        {step === "deploy" && (
          <Deploy
            config={state.config!}
            serverName={state.serverName!}
            location={state.location!}
            serverType={state.serverType!}
            mode={mode}
            onComplete={(result) => {
              updateState({
                serverIp: result.serverIp,
                domain: result.domain,
              });
              setStep("complete");
            }}
            onError={(error) => {
              updateState({ error });
              setStep("error");
            }}
          />
        )}

        {step === "complete" && <Complete state={state} />}

        {step === "error" && (
          <ErrorDisplay
            error={state.error!}
            onRetry={() => setStep("deploy")}
            onBack={() => setStep("server-config")}
          />
        )}
      </Box>
    </HetznerProvider>
  );
}
