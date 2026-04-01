import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { sendDigests } from "@/lib/digest";

/**
 * Hourly sync: Supabase → Google Sheets (backup).
 * Call with CRON_SECRET header for auth.
 * Also triggered by in-process cron when server runs persistently.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scriptPath = path.join(process.cwd(), "scripts", "sync-supabase-to-sheets.js");
  return new Promise<NextResponse>((resolve) => {
    const child = spawn("node", [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("close", (code) => {
      if (code === 0) {
        // Single Vercel Hobby cron: run digest on the 11:00 UTC hourly tick (schedule is :00).
        const runDigest = new Date().getUTCHours() === 11;
        if (!runDigest) {
          resolve(NextResponse.json({ ok: true, message: "Sync complete" }));
          return;
        }
        void (async () => {
          try {
            const { sent, errors } = await sendDigests();
            resolve(
              NextResponse.json({
                ok: true,
                message: "Sync complete",
                digest: { sent, errors },
              })
            );
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            resolve(
              NextResponse.json({
                ok: true,
                message: "Sync complete",
                digest: { error: err },
              })
            );
          }
        })();
      } else {
        resolve(
          NextResponse.json(
            { ok: false, error: stderr || stdout || `Exit ${code}` },
            { status: 500 }
          )
        );
      }
    });
    child.on("error", (err) => {
      resolve(
        NextResponse.json({ ok: false, error: err.message }, { status: 500 })
      );
    });
  });
}
