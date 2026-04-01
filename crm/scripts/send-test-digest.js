#!/usr/bin/env node
/**
 * Send a test daily digest email via Resend.
 * Run: cd crm && node scripts/send-test-digest.js
 */
const path = require("path");
const fs = require("fs");
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}

const apiKey = process.env.RESEND_API_KEY;
// Resend requires verified domain. Use onboarding@resend.dev for testing (no domain needed).
const from = process.env.DAILY_DIGEST_FROM || "Olready CRM <onboarding@resend.dev>";
const to = (process.env.DAILY_DIGEST_EMAILS || "olreadycrm@gmail.com").split(",").map((e) => e.trim()).filter(Boolean);

if (!apiKey || !to.length) {
  console.error("RESEND_API_KEY and DAILY_DIGEST_EMAILS required");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Daily Digest</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h1>Daily Digest – ${today}</h1>
  <p>This is a test email from Olready CRM.</p>
  <h2>Overdue Tasks (0)</h2>
  <p>None</p>
  <h2>Tasks Due Today (0)</h2>
  <p>None</p>
  <h2>Follow-ups Today (0)</h2>
  <p>None</p>
  <p>If you received this, email is configured correctly.</p>
</body>
</html>`;

async function run() {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: from.includes("@") ? from : `Olready CRM <${from}>`,
      to,
      subject: `Daily Digest – ${today} – Test`,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Failed:", res.status, data);
    process.exit(1);
  }
  console.log("Sent to", to.join(", "), "| ID:", data.id);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
