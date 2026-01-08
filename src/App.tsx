import { useState, useEffect } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { Welcome } from "./components/steps/Welcome.js";
import { ConfigSetup } from "./components/steps/ConfigSetup.js";
import { ServerConfig } from "./components/steps/ServerConfig.js";
import { AccessoriesConfig } from "./components/steps/AccessoriesConfig.js";
import { Deploy } from "./components/steps/Deploy.js";
import { Complete } from "./components/steps/Complete.js";
import { ErrorDisplay } from "./components/steps/ErrorDisplay.js";
import type { AccessoriesConfig as AccessoriesConfigType } from "./lib/types.js";
import { DashboardHome } from "./components/dashboard/DashboardHome.js";
import { HetznerProvider } from "./lib/hetzner-context.js";
import { initCleanup, runCleanup } from "./lib/cleanup.js";
import { loadDeployments } from "./lib/storage.js";
import type { RunMode } from "./lib/cli.js";
import type { Config } from "./lib/config.js";

export type WizardStep =
  | "loading"
  | "dashboard"
  | "welcome"
  | "config-setup"
  | "server-config"
  | "accessories-config"
  | "deploy"
  | "complete"
  | "error";

export interface AppState {
  config?: Config;
  serverName?: string;
  location?: string;
  serverType?: string;
  serverCount?: number;
  accessories?: AccessoriesConfigType;
  serverIps?: string[];
  domain?: string;
  loadBalancerIp?: string;
  error?: string;
}

interface AppProps {
  mode: RunMode;
}

export function App({ mode }: AppProps) {
  const { exit } = useApp();
  const [step, setStep] = useState<WizardStep>("loading");
  const [state, setState] = useState<AppState>({});

  const updateState = (updates: Partial<AppState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  // Check for existing deployments on mount
  useEffect(() => {
    loadDeployments().then((deployments) => {
      if (deployments.length > 0) {
        setStep("dashboard");
      } else {
        setStep("welcome");
      }
    });
  }, []);

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

        {step === "loading" && <Text dimColor>Loading...</Text>}

        {step === "dashboard" && (
          <DashboardHome onNewDeployment={() => setStep("welcome")} />
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
            onNext={(serverName, location, serverType, serverCount) => {
              updateState({ serverName, location, serverType, serverCount });
              setStep("accessories-config");
            }}
            onBack={() => setStep("config-setup")}
          />
        )}

        {step === "accessories-config" && (
          <AccessoriesConfig
            serverType={state.serverType!}
            onNext={(accessories) => {
              updateState({ accessories });
              setStep("deploy");
            }}
            onBack={() => setStep("server-config")}
          />
        )}

        {step === "deploy" && (
          <Deploy
            config={state.config!}
            serverName={state.serverName!}
            location={state.location!}
            serverType={state.serverType!}
            serverCount={state.serverCount || 1}
            accessories={state.accessories}
            mode={mode}
            onComplete={(result) => {
              updateState({
                serverIps: result.serverIps,
                domain: result.domain,
                loadBalancerIp: result.loadBalancerIp,
              });
              setStep("complete");
            }}
            onError={(error) => {
              updateState({ error });
              setStep("error");
            }}
          />
        )}

        {step === "complete" && (
          <Complete state={state} onDone={() => setStep("dashboard")} />
        )}

        {step === "error" && (
          <ErrorDisplay
            error={state.error!}
            onRetry={() => setStep("deploy")}
            onBack={() => setStep("accessories-config")}
          />
        )}
      </Box>
    </HetznerProvider>
  );
}
