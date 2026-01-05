import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";

interface ErrorDisplayProps {
  error: string;
  onRetry: () => void;
  onBack: () => void;
}

export function ErrorDisplay({ error, onRetry, onBack }: ErrorDisplayProps) {
  useInput((input, key) => {
    if (key.escape) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column">
      <Text bold color="red">
        Deployment Failed
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text color="red">{error}</Text>
      </Box>

      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: "Retry deployment", value: "retry" },
            { label: "Go back to configuration", value: "back" },
          ]}
          onSelect={(item) => {
            if (item.value === "retry") {
              onRetry();
            } else {
              onBack();
            }
          }}
        />
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    </Box>
  );
}
