/**
 * Legacy path — use /api/internal/sms-outbox instead.
 * Kept so existing Zapier/Mac URLs keep working.
 */
export { GET, POST, dynamic } from "../../sms-outbox/route";
