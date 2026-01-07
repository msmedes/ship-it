import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useDeployments } from "../../hooks/useDeployments.js";
import { Panel } from "../shared/Panel.js";
import { kamalDeploy, kamalLogs, kamalRestart, kamalRollback } from "../../lib/kamal.js";
import { removeDeployment } from "../../lib/storage.js";
import { createPreview, listPreviews, deletePreview, type Preview } from "../../lib/preview.js";
import type { ProjectDeployment } from "../../lib/types.js";

interface DashboardHomeProps {
  onNewDeployment: () => void;
}

type ActivePanel = "list" | "actions";
type Action = "deploy" | "logs" | "restart" | "rollback" | "previews" | "delete";

const ACTIONS: Array<{ id: Action; label: string; color?: string }> = [
  { id: "deploy", label: "Deploy" },
  { id: "logs", label: "View Logs" },
  { id: "previews", label: "Previews" },
  { id: "restart", label: "Restart" },
  { id: "rollback", label: "Rollback" },
  { id: "delete", label: "Delete", color: "red" },
];

export function DashboardHome({ onNewDeployment }: DashboardHomeProps) {
  const { deployments, loading, error, refresh } = useDeployments();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activePanel, setActivePanel] = useState<ActivePanel>("list");
  const [actionIndex, setActionIndex] = useState(0);
  const [running, setRunning] = useState<Action | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Preview state
  const [showPreviews, setShowPreviews] = useState(false);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [creatingPreview, setCreatingPreview] = useState(false);
  const [previewRef, setPreviewRef] = useState("HEAD");
  const [previewError, setPreviewError] = useState<string | null>(null);

  const totalListItems = deployments.length + 1; // +1 for "New deployment"
  const selectedDeployment = selectedIndex < deployments.length ? deployments[selectedIndex] : null;

  useInput(async (input, key) => {
    if (running) return;

    // Cancel preview creation
    if (creatingPreview && key.escape) {
      setCreatingPreview(false);
      return;
    }
    if (creatingPreview) return; // TextInput handles other input

    // Clear logs view
    if (logs && (key.escape || input === "b")) {
      setLogs(null);
      return;
    }

    // Handle previews view
    if (showPreviews) {
      if (key.escape || input === "b") {
        setShowPreviews(false);
        setPreviewError(null);
        return;
      }
      const totalPreviewItems = previews.length + 1; // +1 for "New preview"
      if (key.upArrow) {
        setPreviewIndex((prev) => (prev > 0 ? prev - 1 : totalPreviewItems - 1));
      } else if (key.downArrow) {
        setPreviewIndex((prev) => (prev < totalPreviewItems - 1 ? prev + 1 : 0));
      } else if (key.return) {
        if (previewIndex === previews.length) {
          // Create new preview
          setCreatingPreview(true);
          setPreviewRef("HEAD");
        } else {
          // Delete selected preview
          const preview = previews[previewIndex];
          if (preview && selectedDeployment) {
            setPreviewError(null);
            try {
              await deletePreview(selectedDeployment.projectPath, preview.hash);
              const updated = await listPreviews(selectedDeployment.projectPath);
              setPreviews(updated);
              setPreviewIndex(0);
            } catch (err) {
              setPreviewError(err instanceof Error ? err.message : String(err));
            }
          }
        }
      }
      return;
    }

    // Handle delete confirmation
    if (confirmDelete) {
      if (input === "y" || input === "Y") {
        if (selectedDeployment) {
          await removeDeployment(selectedDeployment.id);
          await refresh();
          setSelectedIndex(0);
        }
        setConfirmDelete(false);
      } else {
        setConfirmDelete(false);
      }
      return;
    }

    // Tab to switch panels (only if a project is selected)
    if (key.tab && selectedDeployment) {
      setActivePanel((p) => (p === "list" ? "actions" : "list"));
      return;
    }

    if (activePanel === "list") {
      if (key.upArrow) {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalListItems - 1));
      } else if (key.downArrow) {
        setSelectedIndex((prev) => (prev < totalListItems - 1 ? prev + 1 : 0));
      } else if (key.return) {
        if (selectedIndex === deployments.length) {
          onNewDeployment();
        } else if (selectedDeployment) {
          setActivePanel("actions");
        }
      }
    } else {
      // Actions panel
      if (key.upArrow) {
        setActionIndex((prev) => (prev > 0 ? prev - 1 : ACTIONS.length - 1));
      } else if (key.downArrow) {
        setActionIndex((prev) => (prev < ACTIONS.length - 1 ? prev + 1 : 0));
      } else if (key.return && selectedDeployment) {
        await runAction(ACTIONS[actionIndex].id, selectedDeployment);
      } else if (key.escape || input === "b") {
        setActivePanel("list");
      }
    }
  });

  const runAction = async (action: Action, deployment: ProjectDeployment) => {
    setActionError(null);

    if (action === "delete") {
      setConfirmDelete(true);
      return;
    }

    if (action === "previews") {
      // Load previews and show preview view
      try {
        const loadedPreviews = await listPreviews(deployment.projectPath);
        setPreviews(loadedPreviews);
        setPreviewIndex(0);
        setShowPreviews(true);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      }
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
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const handleCreatePreview = async () => {
    if (!selectedDeployment) return;
    setPreviewError(null);
    setCreatingPreview(false);
    setRunning("previews");
    try {
      await createPreview(selectedDeployment.projectPath, previewRef);
      const updated = await listPreviews(selectedDeployment.projectPath);
      setPreviews(updated);
      setPreviewIndex(0);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const getStatusColor = (status: ProjectDeployment["status"]) => {
    switch (status) {
      case "running":
        return "green";
      case "stopped":
        return "red";
      default:
        return "yellow";
    }
  };

  if (loading) {
    return <Text dimColor>Loading deployments...</Text>;
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  // Logs view (full screen)
  if (logs) {
    return (
      <Box flexDirection="column">
        <Text bold>Logs: {selectedDeployment?.projectName}</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>{logs}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape or b to go back</Text>
        </Box>
      </Box>
    );
  }

  // Delete confirmation
  if (confirmDelete) {
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Delete {selectedDeployment?.projectName}?
        </Text>
        <Box marginTop={1}>
          <Text>This will remove the deployment from ship-it.</Text>
        </Box>
        <Text dimColor>(The server will remain on Hetzner)</Text>
        <Box marginTop={1}>
          <Text>Press </Text>
          <Text color="red" bold>y</Text>
          <Text> to confirm, any other key to cancel</Text>
        </Box>
      </Box>
    );
  }

  // Previews view
  if (showPreviews) {
    return (
      <Box flexDirection="column">
        <Text bold>Previews: {selectedDeployment?.projectName}</Text>

        {running === "previews" && (
          <Box marginTop={1}>
            <Text color="yellow">Creating preview...</Text>
          </Box>
        )}

        {creatingPreview ? (
          <Box marginTop={1} flexDirection="column">
            <Text>Git ref to preview:</Text>
            <Box>
              <Text color="cyan">&gt; </Text>
              <TextInput
                value={previewRef}
                onChange={setPreviewRef}
                onSubmit={handleCreatePreview}
              />
            </Box>
            <Text dimColor>Enter a branch, tag, or commit hash (default: HEAD)</Text>
          </Box>
        ) : (
          <Box marginTop={1} flexDirection="column">
            {previews.length === 0 ? (
              <Text dimColor>No active previews</Text>
            ) : (
              previews.map((preview, index) => (
                <Box key={preview.hash} flexDirection="column">
                  <Box>
                    <Text color={previewIndex === index ? "cyan" : undefined}>
                      {previewIndex === index ? "> " : "  "}
                    </Text>
                    <Text
                      color={previewIndex === index ? "cyan" : undefined}
                      bold={previewIndex === index}
                    >
                      {preview.hash}
                    </Text>
                    <Text dimColor> - {preview.url}</Text>
                  </Box>
                </Box>
              ))
            )}
            <Box marginTop={1}>
              <Text color={previewIndex === previews.length ? "cyan" : "green"}>
                {previewIndex === previews.length ? "> " : "  "}+ New preview
              </Text>
            </Box>
          </Box>
        )}

        {previewError && (
          <Box marginTop={1}>
            <Text color="red">Error: {previewError}</Text>
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>
            {creatingPreview
              ? "Enter to create | Escape to cancel"
              : "Enter on preview to delete | Enter on New to create | b to go back"}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" width={80}>
        {/* Left panel: Project list */}
        <Panel title="Projects" focused={activePanel === "list"} width={30}>
        {deployments.length === 0 ? (
          <Text dimColor>No deployments</Text>
        ) : (
          deployments.map((deployment, index) => (
            <Box key={deployment.id}>
              <Text color={selectedIndex === index ? "cyan" : undefined}>
                {selectedIndex === index ? "> " : "  "}
              </Text>
              <Text
                color={selectedIndex === index ? "cyan" : undefined}
                bold={selectedIndex === index}
              >
                {deployment.projectName}
              </Text>
              <Text> </Text>
              <Text color={getStatusColor(deployment.status)} dimColor>
                [{deployment.status}]
              </Text>
            </Box>
          ))
        )}
        <Box marginTop={1}>
          <Text color={selectedIndex === deployments.length ? "cyan" : "green"}>
            {selectedIndex === deployments.length ? "> " : "  "}+ New
          </Text>
        </Box>
      </Panel>

      {/* Right panel: Details & Actions */}
      <Panel
        title={selectedDeployment ? selectedDeployment.projectName : "Details"}
        focused={activePanel === "actions"}
        flexGrow={1}
      >
        {selectedDeployment ? (
          <Box flexDirection="column">
            <Box flexDirection="column" marginBottom={1}>
              <Text>
                <Text dimColor>IP:</Text> {selectedDeployment.serverIp}
              </Text>
              <Text>
                <Text dimColor>Domain:</Text> {selectedDeployment.domain}
              </Text>
              <Text>
                <Text dimColor>Path:</Text> {selectedDeployment.projectPath}
              </Text>
            </Box>

            <Text bold dimColor>Actions</Text>
            {ACTIONS.map((action, index) => (
              <Box key={action.id}>
                <Text
                  color={
                    activePanel === "actions" && actionIndex === index
                      ? "cyan"
                      : undefined
                  }
                >
                  {activePanel === "actions" && actionIndex === index ? "> " : "  "}
                </Text>
                <Text
                  color={
                    action.color ||
                    (activePanel === "actions" && actionIndex === index
                      ? "cyan"
                      : undefined)
                  }
                  bold={activePanel === "actions" && actionIndex === index}
                >
                  {action.label}
                </Text>
                {running === action.id && <Text dimColor> ...</Text>}
              </Box>
            ))}

            {actionError && (
              <Box marginTop={1}>
                <Text color="red">Error: {actionError}</Text>
              </Box>
            )}
          </Box>
        ) : (
          <Text dimColor>Select a project</Text>
        )}
      </Panel>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | Tab switch panels | Enter select | b back
        </Text>
      </Box>
    </Box>
  );
}
