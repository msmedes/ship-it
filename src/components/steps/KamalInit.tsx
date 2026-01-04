import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { initKamal } from "../../lib/kamal.js";

interface KamalInitProps {
  serverIp: string;
  onNext: (projectName: string, repoUrl: string) => void;
  onBack: () => void;
}

type Step = "project-name" | "repo-url" | "initializing" | "error";

export function KamalInit({ serverIp, onNext, onBack }: KamalInitProps) {
  const [step, setStep] = useState<Step>("project-name");
  const [projectName, setProjectName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape && step !== "initializing") {
      onBack();
    }
  });

  const handleProjectNameSubmit = (name: string) => {
    if (!name.trim()) return;
    setProjectName(name);
    setStep("repo-url");
  };

  const handleRepoUrlSubmit = async (url: string) => {
    if (!url.trim()) return;
    setRepoUrl(url);
    setStep("initializing");

    try {
      await initKamal({
        serverIp,
        projectName,
        repoUrl: url,
      });
      onNext(projectName, url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initialize Kamal");
      setStep("error");
    }
  };

  if (step === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    );
  }

  if (step === "project-name") {
    return (
      <Box flexDirection="column">
        <Text bold>Kamal Setup</Text>
        <Box marginTop={1}>
          <Text dimColor>Server IP: {serverIp}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>Project name: </Text>
          <TextInput
            value={projectName}
            onChange={setProjectName}
            onSubmit={handleProjectNameSubmit}
            placeholder="my-rails-app"
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "repo-url") {
    return (
      <Box flexDirection="column">
        <Text bold>Repository URL</Text>
        <Box marginTop={1}>
          <Text>Git URL: </Text>
          <TextInput
            value={repoUrl}
            onChange={setRepoUrl}
            onSubmit={handleRepoUrlSubmit}
            placeholder="git@github.com:user/repo.git"
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "initializing") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Initializing Kamal on server...</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>• Connecting via SSH</Text>
          <Text dimColor>• Installing dependencies</Text>
          <Text dimColor>• Running kamal init</Text>
          <Text dimColor>• Cloning repository</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
