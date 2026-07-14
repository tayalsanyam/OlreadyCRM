import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(join(__dirname, "..", file), "utf8").split("\n")) {
      const m = /^([^#=]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

function classifyReply(text: string): string {
  if (/we've sent your details to our team|Someone will contact you within \*\*24 hours\*\*/i.test(text)) {
    return "signup_handoff (deterministic — not OpenAI)";
  }
  if (/Olready connects verified bridal leads to partner MUAs with plan-based exposure/i.test(text)) {
    return "legacy_fallback (old template — not OpenAI)";
  }
  if (/I found guidance related to:|I found guidance on:|here's what I can share from our materials/i.test(text)) {
    return "likely_legacy_fallback (old template — not OpenAI)";
  }
  if (/Ask me about \*\*plans\*\*, \*\*how leads work\*\*/i.test(text)) {
    return "likely_legacy_fallback (old template — not OpenAI)";
  }
  // Structured fallback tends to be short bullet lists with Hi {name},
  if (
    /^Hi \w+,?\n\n(- .+\n){1,3}/m.test(text) &&
    text.length < 600 &&
    !/\?\s*$/.test(text.split("\n").pop() ?? "")
  ) {
    return "possible_structured_fallback (no OpenAI logging — heuristic)";
  }
  return "likely_openai (natural reply — heuristic)";
}

async function main() {
  const { withTransaction } = await import("@/db/index");
  const { hasOpenAiKey } = await import("@/lib/ai-config");

  console.log("OPENAI_API_KEY configured:", hasOpenAiKey());

  await withTransaction(async (tx) => {
    const sessions = await tx<
      {
        id: string;
        name: string;
        segment: string;
        createdAt: string;
        lastMessageAt: string | null;
      }[]
    >`
      SELECT id, name, segment, created_at AS "createdAt", last_message_at AS "lastMessageAt"
      FROM support.public_chat_sessions
      ORDER BY COALESCE(last_message_at, created_at) DESC
      LIMIT 5
    `;

    if (!sessions.length) {
      console.log("No support chat sessions found.");
      return;
    }

    console.log("\nRecent support chat sessions:\n");

    for (const s of sessions) {
      const messages = await tx<
        { role: string; content: string; createdAt: string; replySource: string | null }[]
      >`
        SELECT role, content, created_at AS "createdAt", reply_source AS "replySource"
        FROM support.public_chat_messages
        WHERE session_id = ${s.id}::uuid
        ORDER BY created_at ASC
      `;

      console.log(`── ${s.name} | ${s.segment} | session ${s.id.slice(0, 8)}…`);
      console.log(`   Last activity: ${s.lastMessageAt ?? s.createdAt}`);

      for (const m of messages) {
        const preview =
          m.content.length > 120 ? `${m.content.slice(0, 120).replace(/\n/g, " ")}…` : m.content.replace(/\n/g, " ");
        if (m.role === "user") {
          console.log(`   USER: ${preview}`);
        } else {
          const stored = m.replySource ?? "unknown (pre-migration)";
          console.log(`   ASSISTANT [source: ${stored}]:`);
          console.log(`   ${m.content.slice(0, 500).replace(/\n/g, "\n   ")}${m.content.length > 500 ? "…" : ""}`);
        }
      }
      console.log("");
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
