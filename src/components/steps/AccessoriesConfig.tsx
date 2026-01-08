import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AccessoryType, AccessoryPlacement, AccessoriesConfig, AccessoryConfig, ACCESSORY_DEFAULTS } from "../../lib/types.js";
import { ACCESSORY_DEFAULTS as DEFAULTS } from "../../lib/types.js";

interface AccessoriesConfigProps {
  serverType: string;
  onNext: (accessories: AccessoriesConfig) => void;
  onBack: () => void;
}

type Step = "select-accessories" | "select-placement" | "confirm";

interface AccessoryOption {
  type: AccessoryType;
  label: string;
  description: string;
}

const ACCESSORY_OPTIONS: AccessoryOption[] = [
  { type: "postgres", label: "PostgreSQL", description: "Relational database" },
  { type: "redis", label: "Redis", description: "Cache and message queue" },
  { type: "mysql", label: "MySQL", description: "Relational database" },
];

function generatePassword(length: number = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => chars[b % chars.length])
    .join("");
}

export function AccessoriesConfig({ serverType, onNext, onBack }: AccessoriesConfigProps) {
  const [step, setStep] = useState<Step>("select-accessories");
  const [selectedAccessories, setSelectedAccessories] = useState<Set<AccessoryType>>(new Set());
  const [placement, setPlacement] = useState<AccessoryPlacement>("same-server");
  const [cursorIndex, setCursorIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      if (step === "select-placement") {
        setStep("select-accessories");
      } else if (step === "confirm") {
        setStep("select-placement");
      } else {
        onBack();
      }
      return;
    }

    if (step === "select-accessories") {
      const maxIndex = ACCESSORY_OPTIONS.length; // +1 for "Skip" option would be at end

      if (key.upArrow) {
        setCursorIndex((i) => (i > 0 ? i - 1 : ACCESSORY_OPTIONS.length - 1));
      } else if (key.downArrow) {
        setCursorIndex((i) => (i < ACCESSORY_OPTIONS.length - 1 ? i + 1 : 0));
      } else if (input === " ") {
        // Toggle selection
        const accessory = ACCESSORY_OPTIONS[cursorIndex];
        setSelectedAccessories((prev) => {
          const next = new Set(prev);
          if (next.has(accessory.type)) {
            next.delete(accessory.type);
          } else {
            next.add(accessory.type);
          }
          return next;
        });
      } else if (key.return) {
        if (selectedAccessories.size === 0) {
          // Skip accessories entirely
          onNext({
            enabled: false,
            accessories: [],
            placement: "same-server",
          });
        } else {
          setStep("select-placement");
          setCursorIndex(0);
        }
      }
    } else if (step === "select-placement") {
      if (key.upArrow || key.downArrow) {
        setCursorIndex((i) => (i === 0 ? 1 : 0));
      } else if (key.return) {
        setPlacement(cursorIndex === 0 ? "same-server" : "dedicated-server");
        setStep("confirm");
      }
    } else if (step === "confirm") {
      if (key.return) {
        // Generate passwords and create config
        const accessories: AccessoryConfig[] = Array.from(selectedAccessories).map((type) => ({
          type,
          password: generatePassword(),
          port: DEFAULTS[type].port,
          database: DEFAULTS[type].database || undefined,
          username: DEFAULTS[type].username || undefined,
        }));

        onNext({
          enabled: true,
          accessories,
          placement,
        });
      }
    }
  });

  if (step === "select-accessories") {
    return (
      <Box flexDirection="column">
        <Text bold>Select Accessories (optional)</Text>
        <Text dimColor>Use Space to toggle, Enter to continue</Text>

        <Box marginTop={1} flexDirection="column">
          {ACCESSORY_OPTIONS.map((option, i) => {
            const isSelected = selectedAccessories.has(option.type);
            const isCursor = cursorIndex === i;

            return (
              <Box key={option.type}>
                <Text color={isCursor ? "cyan" : undefined}>
                  {isCursor ? "> " : "  "}
                </Text>
                <Text color={isSelected ? "green" : undefined}>
                  [{isSelected ? "x" : " "}]
                </Text>
                <Text color={isCursor ? "cyan" : undefined} bold={isCursor}>
                  {" "}{option.label}
                </Text>
                <Text dimColor> - {option.description}</Text>
              </Box>
            );
          })}
        </Box>

        <Box marginTop={1}>
          {selectedAccessories.size === 0 ? (
            <Text dimColor>Press Enter to skip accessories</Text>
          ) : (
            <Text dimColor>
              Selected: {Array.from(selectedAccessories).join(", ")}
            </Text>
          )}
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "select-placement") {
    return (
      <Box flexDirection="column">
        <Text bold>Accessory Placement</Text>
        <Text dimColor>
          Selected: {Array.from(selectedAccessories).join(", ")}
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text color={cursorIndex === 0 ? "cyan" : undefined}>
              {cursorIndex === 0 ? "> " : "  "}
            </Text>
            <Text color={cursorIndex === 0 ? "cyan" : undefined} bold={cursorIndex === 0}>
              Same server
            </Text>
            <Text dimColor> - Simpler, shared resources</Text>
          </Box>
          <Box>
            <Text color={cursorIndex === 1 ? "cyan" : undefined}>
              {cursorIndex === 1 ? "> " : "  "}
            </Text>
            <Text color={cursorIndex === 1 ? "cyan" : undefined} bold={cursorIndex === 1}>
              Dedicated server
            </Text>
            <Text dimColor> - Better isolation (+~€4/mo)</Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            {cursorIndex === 0
              ? "Accessories run alongside your app on the same server"
              : `A separate ${serverType} server will be provisioned for databases`}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press Enter to continue, Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "confirm") {
    const finalPlacement = cursorIndex === 0 ? "same-server" : "dedicated-server";

    return (
      <Box flexDirection="column">
        <Text bold>Confirm Accessories</Text>

        <Box marginTop={1} flexDirection="column" marginLeft={2}>
          <Text>
            <Text dimColor>Accessories:</Text>{" "}
            {Array.from(selectedAccessories).map((type) => {
              const opt = ACCESSORY_OPTIONS.find((o) => o.type === type);
              return opt?.label;
            }).join(", ")}
          </Text>
          <Text>
            <Text dimColor>Placement:</Text>{" "}
            {placement === "same-server" ? (
              "Same server as app"
            ) : (
              <Text color="blue">Dedicated server (+~€4/mo)</Text>
            )}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            Passwords will be auto-generated and stored in .kamal/secrets
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>Press Enter to continue, Escape to go back</Text>
        </Box>
      </Box>
    );
  }

  return null;
}
