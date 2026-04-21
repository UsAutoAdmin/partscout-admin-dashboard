import "server-only";
import { Client } from "undici";

const PICK_SHEET_SERVICE_URL = (
  process.env.PICK_SHEET_SERVICE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

const origin = new URL(PICK_SHEET_SERVICE_URL).origin;

/**
 * Persistent undici Client for calling the Railway extraction service.
 * headersTimeout / bodyTimeout set to 10 minutes to survive slow
 * PYP infinite-scroll extractions that routinely take 5-7 min.
 */
const railwayClient = new Client(origin, {
  headersTimeout: 600_000,
  bodyTimeout: 600_000,
  connectTimeout: 30_000,
  keepAliveTimeout: 600_000,
});

export interface RailwayExtractResult {
  ok: boolean;
  statusCode: number;
  vehicles: unknown[];
  raw: unknown;
  error?: string;
}

const RETRYABLE_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the Railway /v2/extract endpoint with timeouts that won't die
 * before slow inventory pages finish scrolling. Retries on 502/503/504.
 */
export async function railwayExtract(
  url: string,
  forceRefresh = false,
): Promise<RailwayExtractResult> {
  let lastResult: RailwayExtractResult | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(
        `[railway-client] retry ${attempt}/${MAX_RETRIES} for ${url} after ${RETRY_DELAY_MS}ms`,
      );
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const res = await railwayClient.request({
        path: "/v2/extract",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, force_refresh: forceRefresh }),
      });

      const text = await res.body.text();

      if (res.statusCode < 200 || res.statusCode >= 300) {
        let errMsg = `Extract failed: ${res.statusCode}`;
        try {
          const errData = JSON.parse(text);
          errMsg = errData.detail || errData.error || errMsg;
        } catch {
          errMsg = text.slice(0, 300) || errMsg;
        }

        lastResult = {
          ok: false,
          statusCode: res.statusCode,
          vehicles: [],
          raw: null,
          error: errMsg,
        };

        if (RETRYABLE_STATUS_CODES.has(res.statusCode) && attempt < MAX_RETRIES) {
          console.warn(
            `[railway-client] got ${res.statusCode} (attempt ${attempt + 1}) — will retry`,
          );
          continue;
        }
        return lastResult;
      }

      let data: { vehicles?: unknown[] } & Record<string, unknown>;
      try {
        data = JSON.parse(text);
      } catch {
        return {
          ok: false,
          statusCode: res.statusCode,
          vehicles: [],
          raw: null,
          error: `Railway returned invalid JSON: ${text.slice(0, 200)}`,
        };
      }

      return {
        ok: true,
        statusCode: res.statusCode,
        vehicles: data.vehicles ?? [],
        raw: data,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      lastResult = {
        ok: false,
        statusCode: 0,
        vehicles: [],
        raw: null,
        error: errMsg,
      };
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[railway-client] network error (attempt ${attempt + 1}): ${errMsg} — will retry`,
        );
        continue;
      }
      return lastResult;
    }
  }

  return (
    lastResult ?? {
      ok: false,
      statusCode: 0,
      vehicles: [],
      raw: null,
      error: "Max retries exhausted",
    }
  );
}
