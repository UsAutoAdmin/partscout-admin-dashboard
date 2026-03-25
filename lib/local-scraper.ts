const agentBaseUrl = process.env.LOCAL_SCRAPER_AGENT_URL || "http://127.0.0.1:3848";

export type LocalScraperStatus = {
  root: string;
  pid: number | null;
  running: boolean;
  logTail: string[];
  dashboardUrl: string;
  agentUrl?: string;
};

async function request(path: string, init?: RequestInit) {
  const res = await fetch(`${agentBaseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Local scraper agent request failed (${res.status})`);
  }
  return data;
}

export async function getLocalScraperStatus(): Promise<LocalScraperStatus> {
  return request("/status");
}

export async function startLocalScraper(): Promise<LocalScraperStatus> {
  return request("/control", { method: "POST", body: JSON.stringify({ action: "start" }) });
}

export async function stopLocalScraper(): Promise<LocalScraperStatus> {
  return request("/control", { method: "POST", body: JSON.stringify({ action: "stop" }) });
}

export async function restartLocalScraper(): Promise<LocalScraperStatus> {
  return request("/control", { method: "POST", body: JSON.stringify({ action: "restart" }) });
}
