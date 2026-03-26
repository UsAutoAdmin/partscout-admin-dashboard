import http from 'http';

const SECRET = process.env.LOCAL_SCRAPER_AGENT_SECRET || '';
const PORT = Number(process.env.LOCAL_FLEET_GATEWAY_PORT || 3850);
const FLEET = [
  { key: 'mini1', label: 'Mac mini 1', ip: '100.106.88.91' },
  { key: 'mini2', label: 'Mac mini 2', ip: '100.100.6.101' },
  { key: 'mini3', label: 'Mac mini 3', ip: '100.68.192.57' },
];

async function agentRequest(baseUrl, path, init = {}) {
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  if (SECRET) headers['x-agent-secret'] = SECRET;
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Agent request failed (${res.status})`);
  return data;
}

async function getFleetStatus() {
  return Promise.all(FLEET.map(async (machine) => {
    const baseUrl = `http://${machine.ip}:3848`;
    try {
      const status = await agentRequest(baseUrl, '/status');
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
        error: error instanceof Error ? error.message : 'Unknown fleet agent error',
      };
    }
  }));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.url === '/fleet/status' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(await getFleetStatus()));
      return;
    }

    if (req.url === '/fleet/control' && req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      const machine = FLEET.find((item) => item.key === body?.key);
      if (!machine || !body?.action) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing key or action' }));
        return;
      }
      const result = await agentRequest(`http://${machine.ip}:3848`, '/control', {
        method: 'POST',
        body: JSON.stringify({ action: body.action }),
      });
      res.writeHead(200);
      res.end(JSON.stringify(result));
      return;
    }

    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, port: PORT }));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Gateway error' }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[fleet-gateway] listening on http://127.0.0.1:${PORT}`);
});
