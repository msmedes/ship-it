import { Box, Text } from "ink";
import type { AppState } from "../../App.js";

interface CompleteProps {
  state: AppState;
}

export function Complete({ state }: CompleteProps) {
  return (
    <Box flexDirection="column">
      <Text bold color="green">
        Deployment Complete!
      </Text>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text>
          <Text dimColor>Server IP:</Text> {state.serverIp}
        </Text>
        <Text>
          <Text dimColor>Domain:</Text> {state.domain}
        </Text>
        <Text>
          <Text dimColor>Server ID:</Text> {state.serverId}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Your app is live at:</Text>
        <Box marginLeft={2}>
          <Text color="cyan">http://{state.domain}</Text>
        </Box>
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
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}
