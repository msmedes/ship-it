import { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useHetzner } from "../../lib/hetzner-context.js";
import type { ServerType, Location } from "../../lib/hetzner.js";

interface ServerConfigProps {
  hetznerToken: string;
  onNext: (serverName: string, location: string, serverType: string, serverCount: number) => void;
  onBack: () => void;
}

type Step = "loading" | "name" | "location" | "type" | "count" | "confirm";

export function ServerConfig({ hetznerToken, onNext, onBack }: ServerConfigProps) {
  const { client } = useHetzner();
  const [step, setStep] = useState<Step>("loading");
  const [serverTypes, setServerTypes] = useState<ServerType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [serverName, setServerName] = useState("");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [selectedType, setSelectedType] = useState<ServerType | null>(null);
  const [serverCount, setServerCount] = useState("1");
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      if (step === "type") {
        setStep("location");
      } else if (step === "location") {
        setStep("name");
      } else if (step === "count") {
        setStep("type");
      } else if (step === "confirm") {
        setStep("count");
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
      }
    }
    loadData();
  }, [hetznerToken, client]);

  const handleNameSubmit = (name: string) => {
    if (!name.trim()) return;
    setServerName(name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-"));
    setStep("location");
  };

  const handleLocationSelect = (item: { value: Location }) => {
    setSelectedLocation(item.value);
    setStep("type");
  };

  const handleTypeSelect = (item: { value: ServerType }) => {
    setSelectedType(item.value);
    setStep("count");
  };

  const handleCountSubmit = (value: string) => {
    const count = parseInt(value, 10);
    if (isNaN(count) || count < 1) {
      setServerCount("1");
      return;
    }
    if (count > 10) {
      setServerCount("10");
      return;
    }
    setServerCount(String(count));
    setStep("confirm");
  };

  const handleConfirm = (item: { value: string }) => {
    if (item.value === "yes") {
      onNext(serverName, selectedLocation!.name, selectedType!.name, parseInt(serverCount, 10));
    } else {
      setStep("name");
    }
  };

  const getPriceForLocation = (serverType: ServerType, locationName: string): string => {
    const price = serverType.prices.find((p) => p.location === locationName);
    return price?.price_monthly?.gross || "?";
  };

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    );
  }

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

  if (step === "name") {
    return (
      <Box flexDirection="column">
        <Text bold>Server Configuration</Text>
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
    const regions = new Map<string, Location[]>();
    for (const loc of locations) {
      const region =
        loc.country === "US"
          ? "Americas"
          : loc.country === "SG"
            ? "Asia Pacific"
            : "Europe";
      if (!regions.has(region)) {
        regions.set(region, []);
      }
      regions.get(region)!.push(loc);
    }

    const items: Array<{ key: string; label: string; value: Location }> = [];
    for (const [region, locs] of regions) {
      for (const loc of locs) {
        items.push({
          key: loc.name,
          label: `[${region}] ${loc.city}, ${loc.country} (${loc.name})`,
          value: loc,
        });
      }
    }

    return (
      <Box flexDirection="column">
        <Text bold>Select Location</Text>
        <Box marginTop={1}>
          <Text dimColor>Server: {serverName}</Text>
        </Box>
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
    const sharedTypes = serverTypes.filter(
      (t) =>
        t.name.startsWith("cx") ||
        t.name.startsWith("cpx") ||
        t.name.startsWith("cax")
    );

    const items = sharedTypes.map((t) => ({
      key: t.name,
      label: `${t.name.padEnd(8)} ${t.cores} vCPU, ${String(t.memory).padStart(3)}GB RAM, ${String(t.disk).padStart(4)}GB disk  €${getPriceForLocation(t, selectedLocation!.name)}/mo`,
      value: t,
    }));

    return (
      <Box flexDirection="column">
        <Text bold>Select Server Type</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {serverName} in {selectedLocation!.city}
          </Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <SelectInput items={items} onSelect={handleTypeSelect} limit={12} />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "count") {
    const count = parseInt(serverCount, 10);
    const pricePerServer = parseFloat(getPriceForLocation(selectedType!, selectedLocation!.name));
    const lbPrice = count > 1 ? 6 : 0; // ~€6/mo for lb11
    const totalPrice = (pricePerServer * count + lbPrice).toFixed(2);

    return (
      <Box flexDirection="column">
        <Text bold>Number of Servers</Text>
        <Box marginTop={1}>
          <Text dimColor>
            {serverName} • {selectedType!.name} in {selectedLocation!.city}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>How many servers? </Text>
          <TextInput
            value={serverCount}
            onChange={setServerCount}
            onSubmit={handleCountSubmit}
          />
        </Box>
        <Box marginTop={1} flexDirection="column">
          {count > 1 && (
            <>
              <Text color="blue">
                Load balancer will be created automatically (~€6/mo)
              </Text>
              <Text color="yellow">
                Note: Multi-server uses HTTP (no auto-SSL)
              </Text>
            </>
          )}
          <Text dimColor>
            Estimated: €{totalPrice}/mo ({count} server{count > 1 ? "s" : ""}{count > 1 ? " + LB" : ""})
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "confirm") {
    const count = parseInt(serverCount, 10);
    const pricePerServer = parseFloat(getPriceForLocation(selectedType!, selectedLocation!.name));
    const lbPrice = count > 1 ? 6 : 0;
    const totalPrice = (pricePerServer * count + lbPrice).toFixed(2);

    return (
      <Box flexDirection="column">
        <Text bold>Confirm Configuration</Text>
        <Box marginTop={1} flexDirection="column" marginLeft={2}>
          <Text>
            <Text dimColor>Name:</Text> {serverName}
          </Text>
          <Text>
            <Text dimColor>Location:</Text> {selectedLocation!.city} ({selectedLocation!.name})
          </Text>
          <Text>
            <Text dimColor>Type:</Text> {selectedType!.name} ({selectedType!.cores} vCPU, {selectedType!.memory}GB RAM)
          </Text>
          <Text>
            <Text dimColor>Servers:</Text> {count}
          </Text>
          {count > 1 && (
            <Text>
              <Text dimColor>Load Balancer:</Text> <Text color="blue">Yes (auto-provisioned)</Text>
            </Text>
          )}
          <Text>
            <Text dimColor>Price:</Text> €{totalPrice}/mo
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Deploy with this configuration?</Text>
        </Box>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: "Yes, deploy now", value: "yes" },
              { label: "No, start over", value: "no" },
            ]}
            onSelect={handleConfirm}
          />
        </Box>
      </Box>
    );
  }

  return null;
}
