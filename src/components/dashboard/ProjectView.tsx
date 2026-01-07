import { useState } from "react";
import { Box, Text, useInput }from "ink";
import { kamalDeploy, kamalLogs, kamalRestart, kamalRollback } from "../../lib/kamal.js";
import { removeDeployment } from "../../lib/storage.js";
import type { ProjectDeployment } from "../../lib/types.js";

interface ProjectViewProps {
  deployment: ProjectDeployment;
  onBack: () => void;
  onDeleted: () => void;
}

type Action = "deploy" | "logs" | "restart" | "rollback" | "delete";

const ACTIONS: Array<{ id: Action; label: string; color?: string }> = [
  { id: "deploy", label: "Deploy" },
  { id: "logs", label: "View Logs" },
  { id: "restart", label: "Restart" },
  { id: "rollback", label: "Rollback" },
  { id: "delete", label: "Delete", color: "red" },
];

export function ProjectView({ deployment, onBack, onDeleted }: ProjectViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [running, setRunning] = useState<Action | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useInput(async (input, key) => {
    if (running) return;

    if (key.escape || (input === "b" && !confirmDelete)) {
      if (logs) {
        setLogs(null);
      } else {
        onBack();
      }
      return;
    }

    if (confirmDelete) {
      if (input === "y" || input === "Y") {
        await removeDeployment(deployment.id);
        onDeleted();
      } else {
        setConfirmDelete(false);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : ACTIONS.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < ACTIONS.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const action = ACTIONS[selectedIndex].id;
      await runAction(action);
    }
  });

  const runAction = async (action: Action) => {
    setError(null);

    if (action === "delete") {
      setConfirmDelete(true);
      return;
    }

    setRunning(action);
    try {
      switch (action) {
        case "deploy":
          await kamalDeploy(deployment.projectPath);
          break;
        case "logs":
          const logsOutput = await kamalLogs(deployment.projectPath, 50);
          setLogs(logsOutput);
          break;
        case "restart":
          await kamalRestart(deployment.projectPath);
          break;
        case "rollback":
          await kamalRollback(deployment.projectPath);
          break;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  if (logs) {
    return (
      <Box flexDirection="column">
        <Text bold>Logs for {deployment.projectName}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>{logs}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape or b to go back</Text>
        </Box>
      </Box>
    );
  }

  if (confirmDelete) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">Delete {deployment.projectName}?</Text>
        <Box marginTop={1}>
          <Text>This will remove the deployment from ship-it.</Text>
        </Box>
        <Box>
          <Text dimColor>(The server will remain on Hetzner)</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Press </Text>
          <Text color="red" bold>y</Text>
          <Text> to confirm, any other key to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>{deployment.projectName}</Text>
        <Text dimColor> — {deployment.serverIp}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        <Text>
          <Text dimColor>Domain:</Text> {deployment.domain}
        </Text>
        <Text>
          <Text dimColor>Server:</Text> {deployment.serverName} (ID: {deployment.serverId})
        </Text>
        <Text>
          <Text dimColor>Path:</Text> {deployment.projectPath}
        </Text>
        <Text>
          <Text dimColor>Last deployed:</Text> {new Date(deployment.lastDeployedAt).toLocaleString()}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Actions</Text>
        {ACTIONS.map((action, index) => (
          <Box key={action.id}>
            <Text color={selectedIndex === index ? "cyan" : undefined}>
              {selectedIndex === index ? "> " : "  "}
            </Text>
            <Text
              color={action.color || (selectedIndex === index ? "cyan" : undefined)}
              bold={selectedIndex === index}
            >
              {action.label}
            </Text>
            {running === action.id && <Text dimColor> (running...)</Text>}
          </Box>
        ))}
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to navigate, Enter to select, b to go back</Text>
      </Box>
    </Box>
  );
}
