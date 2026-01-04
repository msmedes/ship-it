import { Box, Text, useInput } from "ink";

interface WelcomeProps {
  onNext: () => void;
}

export function Welcome({ onNext }: WelcomeProps) {
  useInput((input, key) => {
    if (key.return || input === " ") {
      onNext();
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        This wizard will help you set up a new Kamal deployment on Hetzner.
      </Text>
      <Box marginTop={1}>
        <Text dimColor>We'll:</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        <Text>1. Connect to Hetzner Cloud</Text>
        <Text>2. Create a new server</Text>
        <Text>3. Initialize Kamal on the server</Text>
        <Text>4. Set up your repository for deployment</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="green">Press Enter to continue...</Text>
      </Box>
    </Box>
  );
}
