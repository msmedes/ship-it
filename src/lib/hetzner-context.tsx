import { createContext, useContext, type ReactNode } from "react";
import type { RunMode } from "./cli.js";
import * as realHetzner from "./hetzner.js";
import * as mockHetzner from "./hetzner-mock.js";

export interface HetznerClient {
  validateHetznerToken: typeof realHetzner.validateHetznerToken;
  getServerTypes: typeof realHetzner.getServerTypes;
  getLocations: typeof realHetzner.getLocations;
  createServer: typeof realHetzner.createServer;
  getServer: typeof realHetzner.getServer;
  waitForServer: typeof realHetzner.waitForServer;
}

interface HetznerContextValue {
  client: HetznerClient;
  mode: RunMode;
}

const HetznerContext = createContext<HetznerContextValue | null>(null);

export function HetznerProvider({
  mode,
  children,
}: {
  mode: RunMode;
  children: ReactNode;
}) {
  const client: HetznerClient =
    mode === "dry-run" ? mockHetzner : realHetzner;

  return (
    <HetznerContext.Provider value={{ client, mode }}>
      {children}
    </HetznerContext.Provider>
  );
}

export function useHetzner(): HetznerContextValue {
  const context = useContext(HetznerContext);
  if (!context) {
    throw new Error("useHetzner must be used within HetznerProvider");
  }
  return context;
}
