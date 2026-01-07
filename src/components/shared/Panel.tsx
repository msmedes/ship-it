import { Box, Text } from "ink";
import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  children: ReactNode;
  focused?: boolean;
  width?: number | string;
  flexGrow?: number;
}

export function Panel({ title, children, focused = false, width, flexGrow }: PanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={focused ? "cyan" : "gray"}
      paddingX={1}
      width={width}
      flexGrow={flexGrow}
    >
      {title && (
        <Box marginBottom={1}>
          <Text bold color={focused ? "cyan" : undefined}>
            {title}
          </Text>
        </Box>
      )}
      {children}
    </Box>
  );
}
