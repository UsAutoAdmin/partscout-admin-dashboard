import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export function tokenFromRequest(request: Request): string {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-internal-secret")?.trim() ?? "";
}

export function verifyDequeueAuth(request: Request): boolean {
  const token = tokenFromRequest(request);
  if (!token) return false;
  const internal = process.env.INTERNAL_NEW_MEMBER_SECRET?.trim();
  if (internal) {
    try {
      const a = Buffer.from(token, "utf8");
      const b = Buffer.from(internal, "utf8");
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      /* fall through */
    }
  }
  const cron = process.env.CRON_SECRET?.trim();
  if (cron) {
    try {
      const a = Buffer.from(token, "utf8");
      const c = Buffer.from(cron, "utf8");
      if (a.length === c.length && timingSafeEqual(a, c)) return true;
    } catch {
      /* fall through */
    }
  }
  return false;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
