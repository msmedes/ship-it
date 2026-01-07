/**
 * Hook for managing deployments state.
 */

import { useState, useEffect, useCallback } from "react";
import {
  loadDeployments,
  saveDeployment,
  removeDeployment,
  getDeploymentByPath,
} from "../lib/storage.js";
import type { ProjectDeployment } from "../lib/types.js";

export interface UseDeploymentsResult {
  deployments: ProjectDeployment[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  add: (deployment: ProjectDeployment) => Promise<void>;
  remove: (id: string) => Promise<void>;
  getByPath: (path: string) => Promise<ProjectDeployment | null>;
}

export function useDeployments(): UseDeploymentsResult {
  const [deployments, setDeployments] = useState<ProjectDeployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const loaded = await loadDeployments();
      setDeployments(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback(async (deployment: ProjectDeployment) => {
    await saveDeployment(deployment);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await removeDeployment(id);
    await refresh();
  }, [refresh]);

  const getByPath = useCallback(async (path: string) => {
    return getDeploymentByPath(path);
  }, []);

  return {
    deployments,
    loading,
    error,
    refresh,
    add,
    remove,
    getByPath,
  };
}
