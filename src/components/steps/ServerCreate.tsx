import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useHetzner } from "../../lib/hetzner-context.js";
import type { ServerType, Location } from "../../lib/hetzner.js";

interface ServerCreateProps {
  hetznerToken: string;
  onNext: (serverIp: string, serverId: number) => void;
  onBack: () => void;
}

type Step = "loading" | "name" | "location" | "type" | "confirm" | "creating" | "error";

export function ServerCreate({ hetznerToken, onNext, onBack }: ServerCreateProps) {
  const { client } = useHetzner();
  const [step, setStep] = useState<Step>("loading");
  const [serverTypes, setServerTypes] = useState<ServerType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [serverName, setServerName] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedType, setSelectedType] = useState<ServerType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape && step !== "creating") {
      if (step === "type") {
        setStep("location");
      } else if (step === "location") {
        setStep("name");
      } else {
        onBack();
      }
    }
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [types, locs] = await Promise.all([
          client.getServerTypes(hetznerToken),
          client.getLocations(hetznerToken),
        ]);
        setServerTypes(types);
        setLocations(locs);
        setStep("name");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
        setStep("error");
      }
    }
    loadData();
  }, [hetznerToken, client]);

  const handleNameSubmit = (name: string) => {
    if (!name.trim()) return;
    setServerName(name);
    setStep("location");
  };

  const handleLocationSelect = (item: { value: Location }) => {
    setSelectedLocation(item.value);
    setStep("type");
  };

  const handleTypeSelect = async (item: { value: ServerType }) => {
    setSelectedType(item.value);
    setStep("creating");

    try {
      const server = await client.createServer(hetznerToken, {
        name: serverName,
        serverType: item.value.name,
        location: selectedLocation!.name,
      });
      onNext(server.public_net.ipv4.ip, server.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create server");
      setStep("error");
    }
  };

  const getPriceForLocation = (serverType: ServerType, locationName: string): string => {
    const price = serverType.prices.find((p) => p.location === locationName);
    return price?.price_monthly?.gross || "?";
  };

  if (step === "loading") {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading Hetzner data...</Text>
      </Box>
    );
  }

  if (step === "error") {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    );
  }

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <Text bold>Create Server</Text>
        <Box marginTop={1}>
          <Text>Server name: </Text>
          <TextInput
            value={serverName}
            onChange={setServerName}
            onSubmit={handleNameSubmit}
            placeholder="my-app-server"
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "location") {
    // Group locations by region
    const regions = new Map<string, Location[]>();
    for (const loc of locations) {
      const region = loc.country === "US" ? "Americas" :
                     loc.country === "SG" ? "Asia Pacific" : "Europe";
      if (!regions.has(region)) {
        regions.set(region, []);
      }
      regions.get(region)!.push(loc);
    }

    // Flatten with region headers
    const items: Array<{ label: string; value: Location }> = [];
    for (const [region, locs] of regions) {
      for (const loc of locs) {
        items.push({
          label: `[${region}] ${loc.city}, ${loc.country} (${loc.name})`,
          value: loc,
        });
      }
    }

    return (
      <Box flexDirection="column">
        <Text bold>Select Location</Text>
        <Box marginTop={1} flexDirection="column">
          <SelectInput items={items} onSelect={handleLocationSelect} limit={10} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "type") {
    // Filter to shared CPU types and show pricing for selected location
    const sharedTypes = serverTypes.filter(
      (t) => t.name.startsWith("cx") || t.name.startsWith("cpx") || t.name.startsWith("cax")
    );

    const items = sharedTypes.map((t) => ({
      label: `${t.name.padEnd(8)} ${t.cores} vCPU, ${String(t.memory).padStart(3)}GB RAM, ${String(t.disk).padStart(4)}GB disk  €${getPriceForLocation(t, selectedLocation!.name)}/mo`,
      value: t,
    }));

    return (
      <Box flexDirection="column">
        <Text bold>Select Server Type</Text>
        <Box marginTop={1}>
          <Text dimColor>Location: {selectedLocation!.city}, {selectedLocation!.country}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <SelectInput items={items} onSelect={handleTypeSelect} limit={12} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back to location selection</Text>
        </Box>
      </Box>
    );
  }

  if (step === "creating") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Creating server in {selectedLocation?.city}...</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>This may take a minute...</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
