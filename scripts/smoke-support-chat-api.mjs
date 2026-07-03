#!/usr/bin/env node
/**
 * HTTP smoke: public support chat returns replySource and persists it.
 * Usage: node scripts/smoke-support-chat-api.mjs [baseUrl]
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:3000";

function loadEnv() {
  try {
    for (const line of readFileSync(join(__dirname, "../.env.local"), "utf8").split("\n")) {
      const m = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}
loadEnv();

let failed = 0;
function pass(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  failed++;
  console.log(`✗ ${msg}`);
}

async function main() {
  console.log(`Support chat API smoke (${base})\n`);

  const intakeRes = await fetch(`${base}/api/public/care-chat/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Test",
      phone: "9999912345",
      visitorKind: "mua",
    }),
  });
  const intake = await intakeRes.json();
  if (!intakeRes.ok || !intake.data?.sessionId) {
    fail(`intake failed: ${intake.error ?? intakeRes.status}`);
    process.exit(1);
  }
  pass(`intake session ${intake.data.sessionId.slice(0, 8)}… (${intake.data.segment})`);

  const chatRes = await fetch(`${base}/api/public/care-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: intake.data.sessionId,
      message: "How do bridal leads work for makeup artists?",
    }),
  });
  const chat = await chatRes.json();
  if (!chatRes.ok || !chat.data?.reply) {
    fail(`chat failed: ${chat.error ?? chatRes.status}`);
    process.exit(1);
  }

  const src = chat.data.replySource;
  if (src === "openai" || src === "claude" || src === "fallback") {
    pass(`replySource in API response: ${src}`);
  } else {
    fail(`unexpected replySource: ${src ?? "null"}`);
  }

  if (chat.data.reply.length > 20) {
    pass(`reply length ${chat.data.reply.split(/\s+/).length} words`);
  } else {
    fail("reply too short");
  }

  // Verify DB persistence when DATABASE_URL available
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    const url = process.env.DATABASE_URL.includes("?")
      ? `${process.env.DATABASE_URL}&options=-c%20search_path%3Drm`
      : `${process.env.DATABASE_URL}?options=-c%20search_path%3Drm`;
    const sql = postgres(url, { transform: postgres.camel, ssl: url.includes("supabase.co") ? "require" : false, max: 1 });
    try {
      const [row] = await sql`
        SELECT reply_source AS "replySource"
        FROM support.public_chat_messages
        WHERE session_id = ${intake.data.sessionId}::uuid AND role = 'assistant'
        ORDER BY created_at DESC
        LIMIT 1
      `;
      if (row?.replySource === src) {
        pass(`reply_source persisted in DB: ${row.replySource}`);
      } else {
        fail(`DB reply_source mismatch: ${row?.replySource ?? "null"} vs API ${src}`);
      }
    } finally {
      await sql.end({ timeout: 3 });
    }
  }

  console.log(`\n── Summary ── Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
