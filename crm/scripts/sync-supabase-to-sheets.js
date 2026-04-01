#!/usr/bin/env node
/**
 * One-way sync: Supabase → Google Sheets (backup for support).
 * Run: cd crm && node scripts/sync-supabase-to-sheets.js
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

async function run() {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key);
  const sheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!sheetId) {
    console.error("GOOGLE_SPREADSHEET_ID required for sync");
    process.exit(1);
  }
  const { google } = await import("googleapis");
  let creds = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!creds && process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    creds = fs.readFileSync(path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_PATH), "utf8");
  }
  if (!creds) {
    console.error("GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_PATH required");
    process.exit(1);
  }
  const keyJson = typeof creds === "string" ? JSON.parse(creds) : creds;
  const auth = new google.auth.GoogleAuth({ credentials: keyJson, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheets = google.sheets({ version: "v4", auth });

  const tabs = [
    { name: "Users", table: "users", cols: ["id", "username", "password_hash", "role", "assigned_bdm", "team_id", "email"] },
    { name: "BDMs", table: "bdms", cols: ["bdm", "target"] },
    { name: "Plans", table: "plans", cols: ["plan", "price"] },
    { name: "Teams", table: "teams", cols: ["team_id", "team_name", "bdm"] },
    { name: "Leads", table: "leads", cols: ["id", "name", "city", "company", "email", "phone", "insta_id", "bdm", "plan", "status", "source", "remarks", "connected_on", "next_follow_up", "committed_date", "original_price", "discount", "amount_paid", "amount_balance", "payment_status", "payment_mode", "if_part", "created_at", "last_modified"] },
    { name: "Activity", table: "activity", cols: ["id", "lead_id", "date", "time", "action", "user", "notes", "status", "remarks", "next_connect"] },
    { name: "Tasks", table: "tasks", cols: ["id", "title", "due", "assignee", "done", "lead_id"] },
    { name: "BDM_Log", table: "bdm_log", cols: ["id", "bdm", "date", "total_calls", "connected_calls", "non_answered_calls", "talk_time"] },
  ];

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const existing = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
  for (const { name } of tabs) {
    if (!existing.includes(name)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: name } } }] },
      });
      existing.push(name);
      console.log(`Created tab: ${name}`);
    }
  }

  for (const { name, table, cols } of tabs) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`❌ ${name}:`, error.message);
      continue;
    }
    const rows = (data ?? []).map((r) => cols.map((c) => r[c] ?? ""));
    const values = [cols, ...rows];
    const range = `${name}!A1`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });
    console.log(`✓ ${name}: ${rows.length} rows`);
  }
  console.log("\n✅ Sync complete.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
