/**
 * Local dev crons (Node only) — production uses a single vercel.json cron → /api/cron/sync.
 * Loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs".
 */
const cron = require("node-cron");
const path = require("path");
const { spawn } = require("child_process");

const scriptPath = path.join(process.cwd(), "scripts", "sync-supabase-to-sheets.js");

const runDigest = async () => {
  try {
    const { sendDigests } = await import("./lib/digest");
    const { sent, errors } = await sendDigests();
    if (sent) console.log("[cron] Daily digest sent to", sent, "recipient(s)");
    if (errors.length) console.error("[cron] Digest errors:", errors);
  } catch (e) {
    console.error("[cron] Digest failed:", e);
  }
};

const runSyncThenDigest = () => {
  const child = spawn("node", [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  child.on("error", (err: Error) => console.error("[cron/sync]", err.message));
  child.on("close", (code: number | null) => {
    if (code !== 0) {
      console.error("[cron/sync] script exited", code);
      return;
    }
    console.log("[cron/sync] Supabase → Sheets complete, sending digest…");
    void runDigest();
  });
};

cron.schedule("0 6 * * *", runSyncThenDigest, { timezone: "Asia/Kolkata" });
console.log("[cron] Daily 6:00 AM IST: Sheets sync, then email digest");

export {};
