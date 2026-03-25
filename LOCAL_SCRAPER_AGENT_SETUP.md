# Local Scraper Agent Setup

This dashboard can now talk to a machine-local scraper agent, but the hosted dashboard needs a reachable agent URL.

## What already exists

On the Mac mini running the scraper, the local agent now runs at:

- `http://127.0.0.1:3848/status`
- `http://127.0.0.1:3848/control`

It supports:
- `GET /status`
- `POST /control` with `{ "action": "start" | "stop" | "restart" }`

## What the hosted dashboard needs

Set this environment variable in the dashboard runtime:

- `LOCAL_SCRAPER_AGENT_URL`

Example:

```env
LOCAL_SCRAPER_AGENT_URL=https://your-agent-hostname.example.com
```

## Current blocker

The local agent is only listening on loopback (`127.0.0.1`) on the Mac mini.
A Vercel-hosted dashboard cannot reach that directly.

## Recommended next step

Expose the local agent securely using one of:

1. Cloudflare Tunnel
2. Tailscale / Funnel
3. Reverse proxy with auth on the local machine or LAN

## Minimal validation

From the machine hosting the dashboard runtime, this must work:

```bash
curl "$LOCAL_SCRAPER_AGENT_URL/status"
```

And it should return JSON including:
- `running`
- `pid`
- `logTail`
- `dashboardUrl`

## Security note

Do not expose the agent publicly without protection.
If tunneled, add at least one of:
- shared secret header
- network ACL
- tunnel access policy
- reverse proxy auth
