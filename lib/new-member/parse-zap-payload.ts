/**
 * Normalizes Zapier / Skool webhook JSON (shape varies by Zap step).
 */

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v).trim();
  return "";
}

function pick(
  obj: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = obj[k];
    const s = str(v);
    if (s) return s;
    const lower = Object.entries(obj).find(([x]) => x.toLowerCase() === k.toLowerCase());
    if (lower) {
      const s2 = str(lower[1]);
      if (s2) return s2;
    }
  }
  return "";
}

export interface ParsedNewMemberPayload {
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  zip: string;
}

export function parseSkoolNewMemberPayload(body: unknown):
  | ParsedNewMemberPayload
  | { error: string } {
  if (body == null || typeof body !== "object") {
    return { error: "JSON body required" };
  }

  const root = body as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root.payload && typeof root.payload === "object"
        ? (root.payload as Record<string, unknown>)
        : null;

  const src = nested ?? root;

  const email = pick(src, "email", "Email", "email_address", "member_email");
  const zip = pick(src, "zip", "zipCode", "zip_code", "Zip", "postal_code", "postalCode");
  const firstName = pick(src, "firstName", "first_name", "FirstName", "fname");
  const lastName = pick(src, "lastName", "last_name", "LastName", "lname");
  const phoneRaw = pick(
    src,
    "phone",
    "Phone",
    "phone_number",
    "phoneNumber",
    "mobile",
    "Mobile",
  );

  if (!email) return { error: "email is required" };
  if (!zip) return { error: "zip is required" };

  return {
    email: email.toLowerCase(),
    phone: phoneRaw ? phoneRaw : null,
    firstName,
    lastName,
    zip,
  };
}
