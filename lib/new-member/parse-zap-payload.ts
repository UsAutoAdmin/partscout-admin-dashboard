/**
 * Normalizes Zapier / Skool / Skool CLI webhook JSON (shapes vary a lot by step).
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const US_ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;

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

/** Merge top-level and common nested API envelopes into one object for `pick()`. */
function buildFlatSource(root: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...root };
  const singleNested = [
    "data",
    "payload",
    "result",
    "output",
    "body",
    "response",
    "user",
    "member",
    "record",
    "profile",
    "respondent",
  ];
  for (const k of singleNested) {
    const v = root[k];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, v as Record<string, unknown>);
    }
  }
  if (root.answers && typeof root.answers === "object" && !Array.isArray(root.answers)) {
    Object.assign(out, root.answers as Record<string, unknown>);
  }
  if (Array.isArray(root.answers)) {
    for (const item of root.answers) {
      if (!item || typeof item !== "object") continue;
      const a = item as Record<string, unknown>;
      const key = str(a.question ?? a.name ?? a.label ?? a.id ?? a.key).toLowerCase();
      const val = str(
        a.value ?? a.answer ?? a.text ?? a.response ?? a.content ?? a.string_value,
      );
      if (val) {
        if (key && (key.includes("zip") || key.includes("postal"))) {
          if (!out.zip) out.zip = val;
        } else if (key && (key.includes("email") || key.includes("e-mail"))) {
          if (!out.email) out.email = val;
        } else if (key && key.includes("phone")) {
          if (!out.phone) out.phone = val;
        } else if (key && (key.includes("first") && key.includes("name"))) {
          if (!out.firstName) out.firstName = val;
        } else if (key && (key.includes("last") && key.includes("name"))) {
          if (!out.lastName) out.lastName = val;
        }
        if (EMAIL_RE.test(val) && !out.email) out.email = val;
        const zm = val.match(US_ZIP_RE);
        if (zm && !out.zip) out.zip = zm[1];
      }
    }
  }
  return out;
}

/** Last resort: walk nested objects/arrays, find a plausible email and US ZIP in any string. */
function deepFindEmailAndZip(
  v: unknown,
  depth: number,
  found: { email?: string; zip?: string },
): void {
  if (depth > 8 || (found.email && found.zip)) return;
  if (typeof v === "string") {
    if (!found.email) {
      const em = v.match(EMAIL_RE);
      if (em) found.email = em[0].toLowerCase();
    }
    if (!found.zip) {
      const z = v.match(US_ZIP_RE);
      if (z) found.zip = z[1];
    }
    return;
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const val of Object.values(v as Record<string, unknown>)) {
      deepFindEmailAndZip(val, depth + 1, found);
      if (found.email && found.zip) return;
    }
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      deepFindEmailAndZip(item, depth + 1, found);
      if (found.email && found.zip) return;
    }
  }
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
  const src = buildFlatSource(root);

  const email = pick(
    src,
    "email",
    "Email",
    "email_address",
    "member_email",
    "user_email",
    "UserEmail",
    "contact_email",
  );
  const zip = pick(
    src,
    "zip",
    "zipCode",
    "zip_code",
    "Zip",
    "postal_code",
    "postalCode",
    "postal",
    "zipcode",
    "user_zip",
    "location_zip",
  );
  const firstName = pick(
    src,
    "firstName",
    "first_name",
    "FirstName",
    "fname",
    "given_name",
  );
  const lastName = pick(
    src,
    "lastName",
    "last_name",
    "LastName",
    "lname",
    "family_name",
  );
  const phoneRaw = pick(
    src,
    "phone",
    "Phone",
    "phone_number",
    "phoneNumber",
    "mobile",
    "Mobile",
  );

  let outEmail = email;
  let outZip = zip;
  if (!outEmail || !outZip) {
    const sub = { email: outEmail, zip: outZip };
    deepFindEmailAndZip(body, 0, sub);
    if (!outEmail && sub.email) outEmail = sub.email;
    if (!outZip && sub.zip) outZip = sub.zip;
  }

  if (!outEmail) {
    return {
      error:
        "email is required: map Skool data into the request body, or include an email under data/user/answers. Ensure prior Zap step output is passed as the POST JSON body.",
    };
  }
  if (!outZip) {
    return {
      error:
        "zip is required: add a 5-digit US zip field. Map the membership question for zip/postal code into the payload, or use a path where zip appears in JSON (data, answers, user).",
    };
  }

  return {
    email: outEmail.toLowerCase(),
    phone: phoneRaw ? phoneRaw : null,
    firstName,
    lastName,
    zip: outZip,
  };
}
