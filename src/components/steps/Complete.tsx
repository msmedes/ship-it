import { Box, Text, useApp } from "ink";
import type { AppState } from "../../App.js";

interface CompleteProps {
  state: AppState;
}

export function Complete({ state }: CompleteProps) {
  const { exit } = useApp();

  return (
    <Box flexDirection="column">
      <Text bold color="green">
        Setup Complete!
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>Your Kamal deployment is ready:</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text>
          <Text dimColor>Server IP:</Text> {state.serverIp}
        </Text>
        <Text>
          <Text dimColor>Project:</Text> {state.projectName}
        </Text>
        <Text>
          <Text dimColor>Repository:</Text> {state.repoUrl}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Next steps:</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text>1. cd into your project directory</Text>
          <Text>2. Review config/deploy.yml</Text>
          <Text>3. Set up your secrets in .kamal/secrets</Text>
          <Text>4. Run: kamal setup</Text>
          <Text>5. Deploy: kamal deploy</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Ctrl+C to exit</Text>
      </Box>
    </Box>
  );
}
