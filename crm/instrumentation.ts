/**
 * Runs when the Next.js server starts. Schedules hourly Supabase→Sheets sync
 * while the project is running (dev, VPS, Railway, etc.).
 * Vercel serverless: use vercel.json crons instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
