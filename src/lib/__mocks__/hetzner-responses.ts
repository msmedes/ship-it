// Mock responses from Hetzner API for testing

export const mockServerTypes = {
  server_types: [
    {
      id: 1,
      name: "cx22",
      description: "CX22",
      cores: 2,
      memory: 4,
      disk: 40,
      prices: [
        { location: "fsn1", price_monthly: { gross: "4.35" } },
        { location: "nbg1", price_monthly: { gross: "4.35" } },
        { location: "hel1", price_monthly: { gross: "4.35" } },
        { location: "ash", price_monthly: { gross: "5.39" } },
        { location: "hil", price_monthly: { gross: "5.39" } },
        { location: "sin", price_monthly: { gross: "5.99" } },
      ],
    },
    {
      id: 2,
      name: "cx32",
      description: "CX32",
      cores: 4,
      memory: 8,
      disk: 80,
      prices: [
        { location: "fsn1", price_monthly: { gross: "8.09" } },
        { location: "nbg1", price_monthly: { gross: "8.09" } },
        { location: "hel1", price_monthly: { gross: "8.09" } },
        { location: "ash", price_monthly: { gross: "9.99" } },
        { location: "hil", price_monthly: { gross: "9.99" } },
        { location: "sin", price_monthly: { gross: "10.99" } },
      ],
    },
    {
      id: 3,
      name: "cax11",
      description: "CAX11 (Arm64)",
      cores: 2,
      memory: 4,
      disk: 40,
      prices: [
        { location: "fsn1", price_monthly: { gross: "3.79" } },
        { location: "nbg1", price_monthly: { gross: "3.79" } },
        { location: "hel1", price_monthly: { gross: "3.79" } },
      ],
    },
  ],
};

export const mockLocations = {
  locations: [
    { id: 1, name: "fsn1", city: "Falkenstein", country: "DE" },
    { id: 2, name: "nbg1", city: "Nuremberg", country: "DE" },
    { id: 3, name: "hel1", city: "Helsinki", country: "FI" },
    { id: 4, name: "ash", city: "Ashburn, VA", country: "US" },
    { id: 5, name: "hil", city: "Hillsboro, OR", country: "US" },
    { id: 6, name: "sin", city: "Singapore", country: "SG" },
  ],
};

export const mockServer = {
  server: {
    id: 12345,
    name: "test-server",
    status: "initializing",
    public_net: {
      ipv4: { ip: "1.2.3.4" },
      ipv6: { ip: "2001:db8::1" },
    },
  },
  root_password: "test-password-123",
};

export const mockServerRunning = {
  server: {
    ...mockServer.server,
    status: "running",
  },
};

export const mockServersEmpty = {
  servers: [],
};

export const mockError = {
  error: {
    message: "Invalid API token",
    code: "unauthorized",
  },
};
