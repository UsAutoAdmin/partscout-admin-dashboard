const agentSharedSecret = process.env.LOCAL_SCRAPER_AGENT_SECRET;

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
    sold: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number; recentTasks?: any[] };
    active: { status: string; rateNum: number; targetWorkers: number; targetBrowsers: number; dbWritesWindow: number; recentTasks?: any[] };
  } | null;
  error?: string;
};

export const SCRAPER_FLEET = [
  { key: "mini1", label: "Mac mini 1", ip: "100.106.88.91" },
  { key: "mini2", label: "Mac mini 2", ip: "100.100.6.101" },
  { key: "mini3", label: "Mac mini 3", ip: "100.68.192.57" },
];

async function request(baseUrl: string, path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(agentSharedSecret ? { "x-agent-secret": agentSharedSecret } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Agent request failed (${res.status})`);
  return data;
}

export async function getScraperFleetStatus(): Promise<FleetScraperStatus[]> {
  return Promise.all(
    SCRAPER_FLEET.map(async (machine) => {
      const baseUrl = `http://${machine.ip}:3848`;
      try {
        const status = await request(baseUrl, "/status");
        return {
          key: machine.key,
          label: machine.label,
          ip: machine.ip,
          root: status.root,
          pid: status.pid ?? null,
          running: !!status.running,
          logTail: status.logTail ?? [],
          dashboardUrl: `http://${machine.ip}:3847`,
          agentUrl: baseUrl,
          metrics: status.metrics ?? null,
        };
      } catch (error) {
        return {
          key: machine.key,
          label: machine.label,
          ip: machine.ip,
          pid: null,
          running: false,
          logTail: [],
          dashboardUrl: `http://${machine.ip}:3847`,
          agentUrl: baseUrl,
          error: error instanceof Error ? error.message : "Unknown fleet agent error",
        };
      }
    })
  );
}

export async function controlScraperFleetMachine(key: string, action: "start" | "stop" | "restart") {
  const machine = SCRAPER_FLEET.find((item) => item.key === key);
  if (!machine) throw new Error("Unknown scraper machine");
  const baseUrl = `http://${machine.ip}:3848`;
  return request(baseUrl, "/control", { method: "POST", body: JSON.stringify({ action }) });
}
