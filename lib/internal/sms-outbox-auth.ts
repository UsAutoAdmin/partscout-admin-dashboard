import "server-only";
import { timingSafeEqual } from "crypto";

/** Prefer SMS_OUTBOX_POLL_SECRET; OPENCLAW_POLL_SECRET kept for older deploys. */
export function getSmsOutboxPollSecret(): string | undefined {
  return (
    process.env.SMS_OUTBOX_POLL_SECRET?.trim() || process.env.OPENCLAW_POLL_SECRET?.trim() || undefined
  );
}

export function verifySmsOutboxPollSecret(request: Request): boolean {
  const secret = getSmsOutboxPollSecret();
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const token =
    bearer ??
    request.headers.get("x-sms-outbox-secret")?.trim() ??
    request.headers.get("x-openclaw-secret")?.trim();
  if (!token) return false;
  try {
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(secret, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
