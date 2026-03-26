export type FleetScraperStatus = {
  key: string;
  label: string;
  ip: string;
  root?: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
  agentUrl: string;
  metrics?: {
    sold: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number };
    active: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number };
  } | null;
  error?: string;
};

const fleetGatewayBaseUrl = process.env.LOCAL_FLEET_GATEWAY_URL || "http://127.0.0.1:3850";

async function gatewayRequest(path: string, init?: RequestInit) {
  const res = await fetch(`${fleetGatewayBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Fleet gateway request failed (${res.status})`);
  return data;
}

export async function getScraperFleetStatusViaGateway(): Promise<FleetScraperStatus[]> {
  return gatewayRequest('/fleet/status');
}

export async function controlScraperFleetMachineViaGateway(key: string, action: 'start' | 'stop' | 'restart') {
  return gatewayRequest('/fleet/control', {
    method: 'POST',
    body: JSON.stringify({ key, action }),
  });
}
