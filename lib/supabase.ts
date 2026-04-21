import { createClient } from "@supabase/supabase-js";
import { Agent, fetch as undiciFetch, type RequestInit } from "undici";

let cachedFetch: typeof fetch | null = null;

// Some Cloudflare anycast PoPs serving *.supabase.co are intermittently
// unreachable from certain ISP paths. SUPABASE_OVERRIDE_IP lets us pin a
// known-good Cloudflare IP for the project host so dev never blanks out
// when one PoP misbehaves. SNI/Host header stay correct so TLS still works.
function buildOverrideFetch(host: string, ip: string): typeof fetch {
  const agent = new Agent({
    connect: {
      lookup: ((_hostname: string, options: { all?: boolean; family?: number }, cb: unknown) => {
        const family = ip.includes(":") ? 6 : 4;
        const result = { address: ip, family };
        const callback = cb as (
          err: NodeJS.ErrnoException | null,
          address: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void;
        if (options?.all) callback(null, [result]);
        else callback(null, result.address, result.family);
      }) as never,
    },
  });

  return (async (input: Request | string | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" || input instanceof URL ? new URL(input) : new URL(input.url);
    if (url.hostname === host) {
      return undiciFetch(url, { ...(init ?? {}), dispatcher: agent });
    }
    return undiciFetch(url, init);
  }) as unknown as typeof fetch;
}

function getOverrideFetch(): typeof fetch | undefined {
  const override = process.env.SUPABASE_OVERRIDE_IP;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!override || !url) return undefined;
  if (cachedFetch) return cachedFetch;
  try {
    const host = new URL(url).hostname;
    console.log(`[supabase] pinning ${host} -> ${override} via SUPABASE_OVERRIDE_IP`);
    cachedFetch = buildOverrideFetch(host, override);
    return cachedFetch;
  } catch (err) {
    console.warn("[supabase] override fetch build failed", err);
    return undefined;
  }
}

export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for dashboard runtime");
  }

  const override = getOverrideFetch();

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: override ? { fetch: override } : undefined,
  });
}
