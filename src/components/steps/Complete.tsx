import { Box, Text, useInput } from "ink";
import type { AppState } from "../../App.js";

interface CompleteProps {
  state: AppState;
  onDone?: () => void;
}

export function Complete({ state, onDone }: CompleteProps) {
  useInput((input, key) => {
    if (key.return && onDone) {
      onDone();
    }
  });

  const serverCount = state.serverIps?.length || 1;
  const isMultiServer = serverCount > 1;
  const protocol = isMultiServer ? "http" : "https";

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        Deployment Complete!
      </Text>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text>
          <Text dimColor>Server IPs:</Text> {state.serverIps?.join(", ")}
        </Text>
        <Text>
          <Text dimColor>Domain:</Text> {state.domain}
        </Text>
        {state.loadBalancerIp && (
          <Text>
            <Text dimColor>Load Balancer IP:</Text> {state.loadBalancerIp}
          </Text>
        )}
        <Text>
          <Text dimColor>Servers:</Text> {serverCount}
        </Text>
        {state.accessories?.enabled && (
          <Text>
            <Text dimColor>Accessories:</Text>{" "}
            {state.accessories.accessories.map((a) => a.type).join(", ")}
            {state.accessories.placement === "dedicated-server" && (
              <Text dimColor> (dedicated server)</Text>
            )}
          </Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Your app is live at:</Text>
        <Box marginLeft={2}>
          <Text color="cyan">{protocol}://{state.domain}</Text>
        </Box>
        {isMultiServer && (
          <Box marginLeft={2}>
            <Text color="yellow" dimColor>(Multi-server: no auto-SSL)</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Useful commands:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor>kamal app logs      </Text>
          <Text dimColor>kamal deploy        </Text>
          <Text dimColor>kamal app exec bash </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Enter to go to dashboard, or Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}
