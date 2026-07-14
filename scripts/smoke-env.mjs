/**
 * Shared smoke-test credentials — matches production staff roster.
 * Password: SMOKE_PASSWORD in .env.local (falls back to demo1234 for seeded local DB).
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadSmokeEnv() {
  try {
    const raw = readFileSync(join(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadSmokeEnv();

/** @type {string} */
export const SMOKE_PASSWORD =
  process.env.SMOKE_PASSWORD ?? process.env.DEMO_PASSWORD ?? "demo1234";

/** Live staff emails (Olready production roster). */
export const SMOKE_USERS = {
  admin: "admin@olready.in",
  owner: "owner@olready.in",
  rm: "neha.xp@olready.in",
  commission: "neha.xpc@olready.in",
  uploader: "uploader@olready.in",
  salesRm: "gurkirankaur@olready.in",
  salesTl: "gauravchettri@olready.in",
  salesActivation: "activation@olready.in",
  feedback: "feedback@olready.in",
  care: "care@olready.in",
};

/**
 * @param {string} base
 * @param {string} email
 * @param {string} [password]
 */
export async function smokeLogin(base, email, password = SMOKE_PASSWORD) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `login ${res.status}`);
  }
  return { cookie, json, userId: json.data?.user?.id };
}
