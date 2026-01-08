import { useState, useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { fullDeploy, type DeployStep } from "../../lib/deploy.js";
import type { RunMode } from "../../lib/cli.js";
import type { Config } from "../../lib/config.js";
import type { AccessoriesConfig } from "../../lib/types.js";

interface DeployProps {
  config: Config;
  serverName: string;
  location: string;
  serverType: string;
  serverCount: number;
  accessories?: AccessoriesConfig;
  mode: RunMode;
  onComplete: (result: { serverIps: string[]; domain: string; loadBalancerIp?: string }) => void;
  onError: (error: string) => void;
}

const STEP_ICONS: Record<DeployStep["status"], string> = {
  pending: "○",
  running: "●",
  done: "✓",
  error: "✗",
};

const STEP_COLORS: Record<DeployStep["status"], string | undefined> = {
  pending: "gray",
  running: "cyan",
  done: "green",
  error: "red",
};

export function Deploy({
  config,
  serverName,
  location,
  serverType,
  serverCount,
  accessories,
  mode,
  onComplete,
  onError,
}: DeployProps) {
  const [steps, setSteps] = useState<DeployStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runDeploy() {
      try {
        const result = await fullDeploy(
          {
            config,
            serverName,
            location,
            serverType,
            serverCount,
            accessories,
            mode,
          },
          (updatedSteps) => {
            if (cancelled) return;
            setSteps([...updatedSteps]);
            const running = updatedSteps.find((s) => s.status === "running");
            setCurrentStep(running?.id || null);
          }
        );

        if (!cancelled) {
          onComplete({
            serverIps: result.serverIps,
            domain: result.domain,
            loadBalancerIp: result.loadBalancerIp,
          });
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    runDeploy();

    return () => {
      cancelled = true;
    };
  }, [config, serverName, location, serverType, serverCount, accessories, mode, onComplete, onError]);

  return (
    <Box flexDirection="column">
      <Text bold>Deploying to Hetzner</Text>
      <Box marginTop={1}>
        <Text dimColor>
          Server: {serverName} ({serverType}) in {location}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        {steps.map((step) => (
          <Box key={step.id}>
            <Box width={3}>
              {step.status === "running" ? (
                <Text color="cyan">
                  <Spinner type="dots" />
                </Text>
              ) : (
                <Text color={STEP_COLORS[step.status]}>
                  {STEP_ICONS[step.status]}
                </Text>
              )}
            </Box>
            <Box width={30}>
              <Text color={step.status === "running" ? "white" : "gray"}>
                {step.name}
              </Text>
            </Box>
            {step.message && (
              <Text dimColor> {step.message}</Text>
            )}
          </Box>
        ))}
      </Box>

      {steps.length === 0 && (
        <Box marginTop={1}>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Starting deployment...</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>This may take a few minutes...</Text>
      </Box>
    </Box>
  );
}
