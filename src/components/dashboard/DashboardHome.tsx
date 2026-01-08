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

// An "instance" is either production or a preview - same actions apply to both
interface Instance {
  type: "production" | "preview";
  name: string;
  destination?: string; // kamal -d flag for previews
  url: string;
  hash?: string;
}

type ActivePanel = "projects" | "instances" | "actions";
type Action = "deploy" | "logs" | "restart" | "rollback" | "delete";

const ACTIONS: Array<{ id: Action; label: string; color?: string }> = [
  { id: "deploy", label: "Deploy" },
  { id: "logs", label: "View Logs" },
  { id: "restart", label: "Restart" },
  { id: "rollback", label: "Rollback" },
  { id: "delete", label: "Delete", color: "red" },
];

export function DashboardHome({ onNewDeployment }: DashboardHomeProps) {
  const { deployments, loading, error, refresh } = useDeployments();

  // Navigation state
  const [activePanel, setActivePanel] = useState<ActivePanel>("projects");
  const [projectIndex, setProjectIndex] = useState(0);
  const [instanceIndex, setInstanceIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);

  // Instance state
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(false);

  // Action state
  const [running, setRunning] = useState<Action | null>(null);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsProc, setLogsProc] = useState<ReturnType<typeof Bun.spawn> | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // New preview state
  const [creatingPreview, setCreatingPreview] = useState(false);
  const [previewRef, setPreviewRef] = useState("HEAD");

  const totalProjects = deployments.length + 1; // +1 for "New"
  const selectedProject = projectIndex < deployments.length ? deployments[projectIndex] : null;
  const totalInstances = instances.length + 1; // +1 for "New preview"
  const selectedInstance = instanceIndex < instances.length ? instances[instanceIndex] : null;

  // Load instances when project changes
  useEffect(() => {
    if (selectedProject) {
      loadInstances(selectedProject);
    } else {
      setInstances([]);
    }
  }, [selectedProject?.id]);

  const loadInstances = async (project: ProjectDeployment) => {
    setLoadingInstances(true);
    // Multi-server deployments use HTTP (no auto-SSL with Kamal)
    const isMultiServer = project.serverIds.length > 1;
    const protocol = isMultiServer ? "http" : "https";
    try {
      const previews = await listPreviews(project.projectPath);
      const allInstances: Instance[] = [
        {
          type: "production",
          name: "production",
          url: `${protocol}://${project.domain}`,
        },
        ...previews.map((p) => ({
          type: "preview" as const,
          name: p.hash,
          destination: `preview-${p.hash}`,
          url: p.url,
          hash: p.hash,
        })),
      ];
      setInstances(allInstances);
    } catch {
      setInstances([
        {
          type: "production",
          name: "production",
          url: `${protocol}://${project.domain}`,
        },
      ]);
    } finally {
      setLoadingInstances(false);
    }
  };

  useInput(async (input, key) => {
    if (running) return;

    // Cancel preview creation
    if (creatingPreview && key.escape) {
      setCreatingPreview(false);
      return;
    }
    if (creatingPreview) return;

    // Logs view - escape to close and kill process
    if (logs !== null && (key.escape || input === "b")) {
      if (logsProc) {
        logsProc.kill();
        setLogsProc(null);
      }
      setLogs(null);
      return;
    }

    // Delete confirmation
    if (confirmDelete) {
      if (input === "y" || input === "Y") {
        await handleDelete();
      }
      setConfirmDelete(false);
      return;
    }

    // Tab to move right, Shift+Tab or b to move left
    if (key.tab && !key.shift) {
      if (activePanel === "projects" && selectedProject) {
        setActivePanel("instances");
        setInstanceIndex(0);
      } else if (activePanel === "instances" && selectedInstance) {
        setActivePanel("actions");
        setActionIndex(0);
      }
      return;
    }
    if ((key.tab && key.shift) || input === "b") {
      if (activePanel === "actions") {
        setActivePanel("instances");
      } else if (activePanel === "instances") {
        setActivePanel("projects");
      }
      return;
    }

    // Panel-specific navigation
    if (activePanel === "projects") {
      if (key.upArrow) {
        setProjectIndex((i) => (i > 0 ? i - 1 : totalProjects - 1));
      } else if (key.downArrow) {
        setProjectIndex((i) => (i < totalProjects - 1 ? i + 1 : 0));
      } else if (key.return) {
        if (projectIndex === deployments.length) {
          onNewDeployment();
        } else {
          setActivePanel("instances");
          setInstanceIndex(0);
        }
      }
    } else if (activePanel === "instances") {
      if (key.upArrow) {
        setInstanceIndex((i) => (i > 0 ? i - 1 : totalInstances - 1));
      } else if (key.downArrow) {
        setInstanceIndex((i) => (i < totalInstances - 1 ? i + 1 : 0));
      } else if (key.return) {
        if (instanceIndex === instances.length) {
          // New preview
          setCreatingPreview(true);
          setPreviewRef("HEAD");
        } else {
          setActivePanel("actions");
          setActionIndex(0);
        }
      }
    } else if (activePanel === "actions") {
      if (key.upArrow) {
        setActionIndex((i) => (i > 0 ? i - 1 : ACTIONS.length - 1));
      } else if (key.downArrow) {
        setActionIndex((i) => (i < ACTIONS.length - 1 ? i + 1 : 0));
      } else if (key.return) {
        await runAction(ACTIONS[actionIndex].id);
      }
    }
  });

  const handleDelete = async () => {
    if (!selectedProject || !selectedInstance) return;

    if (selectedInstance.type === "production") {
      // Delete project from ship-it
      await removeDeployment(selectedProject.id);
      await refresh();
      setProjectIndex(0);
      setActivePanel("projects");
    } else {
      // Delete preview
      await deletePreview(selectedProject.projectPath, selectedInstance.hash!);
      await loadInstances(selectedProject);
      setInstanceIndex(0);
    }
  };

  const runAction = async (action: Action) => {
    if (!selectedProject || !selectedInstance) return;
    setActionError(null);

    if (action === "delete") {
      setConfirmDelete(true);
      return;
    }

    const dest = selectedInstance.destination;
    const destArgs = dest ? ["-d", dest] : [];

    setRunning(action);
    try {
      switch (action) {
        case "deploy":
          const deployProc = Bun.spawn(["kamal", "deploy", ...destArgs], {
            cwd: selectedProject.projectPath,
            stdout: "inherit",
            stderr: "inherit",
          });
          await deployProc.exited;
          break;
        case "logs":
          // Start streaming logs with --follow
          const proc = Bun.spawn(["kamal", "app", "logs", "-f", ...destArgs], {
            cwd: selectedProject.projectPath,
            stdout: "pipe",
            stderr: "pipe",
          });
          setLogsProc(proc);
          setLogs("Loading logs...");

          // Stream stdout
          (async () => {
            const reader = proc.stdout.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                // Keep last ~100 lines
                const lines = buffer.split("\n");
                if (lines.length > 100) {
                  buffer = lines.slice(-100).join("\n");
                }
                setLogs(buffer);
              }
            } catch {
              // Process killed
            }
          })();
          return; // Don't setRunning(null) - logs view handles exit
        case "restart":
          const restartProc = Bun.spawn(["kamal", "app", "boot", ...destArgs], {
            cwd: selectedProject.projectPath,
            stdout: "inherit",
            stderr: "inherit",
          });
          await restartProc.exited;
          break;
        case "rollback":
          const rollbackProc = Bun.spawn(["kamal", "rollback", ...destArgs], {
            cwd: selectedProject.projectPath,
            stdout: "inherit",
            stderr: "inherit",
          });
          await rollbackProc.exited;
          break;
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const handleCreatePreview = async () => {
    if (!selectedProject) return;
    setCreatingPreview(false);
    setRunning("deploy");
    try {
      await createPreview(selectedProject.projectPath, previewRef);
      await loadInstances(selectedProject);
      setInstanceIndex(instances.length); // Select the new preview
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  if (loading) {
    return <Text dimColor>Loading...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error}</Text>;
  }

  // Logs view (streaming)
  if (logs !== null) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>
            Logs: {selectedProject?.projectName} / {selectedInstance?.name}
          </Text>
          <Text color="green"> (streaming)</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>{logs}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press b or Escape to stop</Text>
        </Box>
      </Box>
    );
  }

  // Delete confirmation
  if (confirmDelete) {
    const isProduction = selectedInstance?.type === "production";
    return (
      <Box flexDirection="column">
        <Text bold color="red">
          Delete {selectedInstance?.name}?
        </Text>
        <Box marginTop={1}>
          {isProduction ? (
            <Text>This will remove the project from ship-it (server stays on Hetzner).</Text>
          ) : (
            <Text>This will remove the preview container.</Text>
          )}
        </Box>
        <Box marginTop={1}>
          <Text>Press </Text>
          <Text color="red" bold>y</Text>
          <Text> to confirm, any other key to cancel</Text>
        </Box>
      </Box>
    );
  }

  // New preview input
  if (creatingPreview) {
    return (
      <Box flexDirection="column">
        <Text bold>New Preview</Text>
        <Box marginTop={1}>
          <Text>Git ref: </Text>
          <TextInput
            value={previewRef}
            onChange={setPreviewRef}
            onSubmit={handleCreatePreview}
          />
        </Box>
        <Text dimColor>Branch, tag, or commit (default: HEAD)</Text>
        <Box marginTop={1}>
          <Text dimColor>Enter to create | Escape to cancel</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {/* Projects panel */}
        <Panel title="Projects" focused={activePanel === "projects"} width={24}>
          {deployments.length === 0 ? (
            <Text dimColor>No projects</Text>
          ) : (
            deployments.map((d, i) => (
              <Box key={d.id}>
                <Text color={projectIndex === i ? "cyan" : undefined}>
                  {projectIndex === i ? "> " : "  "}
                  {d.projectName}
                </Text>
              </Box>
            ))
          )}
          <Box marginTop={1}>
            <Text color={projectIndex === deployments.length ? "cyan" : "green"}>
              {projectIndex === deployments.length ? "> " : "  "}+ New
            </Text>
          </Box>
        </Panel>

        {/* Instances panel */}
        <Panel title="Instances" focused={activePanel === "instances"} width={30}>
          {!selectedProject ? (
            <Text dimColor>Select a project</Text>
          ) : loadingInstances ? (
            <Text dimColor>Loading...</Text>
          ) : (
            <>
              {instances.map((inst, i) => (
                <Box key={inst.name}>
                  <Text color={instanceIndex === i ? "cyan" : undefined}>
                    {instanceIndex === i ? "> " : "  "}
                  </Text>
                  <Text
                    color={instanceIndex === i ? "cyan" : inst.type === "production" ? "green" : "yellow"}
                    bold={instanceIndex === i}
                  >
                    {inst.name}
                  </Text>
                </Box>
              ))}
              <Box marginTop={1}>
                <Text color={instanceIndex === instances.length ? "cyan" : "blue"}>
                  {instanceIndex === instances.length ? "> " : "  "}+ New preview
                </Text>
              </Box>
            </>
          )}
        </Panel>

        {/* Actions panel */}
        <Panel title="Actions" focused={activePanel === "actions"} flexGrow={1}>
          {!selectedInstance ? (
            <Text dimColor>Select an instance</Text>
          ) : (
            <>
              <Text dimColor>{selectedInstance.url}</Text>
              <Box marginTop={1} flexDirection="column">
                {ACTIONS.map((action, i) => (
                  <Box key={action.id}>
                    <Text color={actionIndex === i && activePanel === "actions" ? "cyan" : undefined}>
                      {actionIndex === i && activePanel === "actions" ? "> " : "  "}
                    </Text>
                    <Text
                      color={action.color || (actionIndex === i && activePanel === "actions" ? "cyan" : undefined)}
                      bold={actionIndex === i && activePanel === "actions"}
                    >
                      {action.label}
                    </Text>
                    {running === action.id && <Text dimColor> ...</Text>}
                  </Box>
                ))}
              </Box>
              {actionError && (
                <Box marginTop={1}>
                  <Text color="red">{actionError}</Text>
                </Box>
              )}
            </>
          )}
        </Panel>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | Tab/Enter next | b back
        </Text>
      </Box>
    </Box>
  );
}
