/**
 * Local dev crons (Node only) — production uses vercel.json once/day for Sheets sync.
 * Loaded by instrumentation.ts when NEXT_RUNTIME === "nodejs".
 */
const cron = require("node-cron");
const path = require("path");
const { spawn } = require("child_process");

const scriptPath = path.join(process.cwd(), "scripts", "sync-supabase-to-sheets.js");
const runSync = () => {
  const child = spawn("node", [scriptPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  child.on("error", (err: Error) => console.error("[cron/sync]", err.message));
};

cron.schedule("0 6 * * *", runSync, { timezone: "Asia/Kolkata" });
console.log("[cron] Daily sync 6:00 AM IST (Supabase → Sheets)");

// Daily digest: 11 AM IST. If server starts after 11 AM, run immediately (whichever first each day).
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

const now = new Date();
const istHour = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getHours();
if (istHour >= 11) {
  setTimeout(runDigest, 5000); // defer so DB is ready
}
cron.schedule("0 11 * * *", runDigest, { timezone: "Asia/Kolkata" });
console.log("[cron] Daily digest scheduled (11 AM IST, or on start if after 11 AM)");

export {};
