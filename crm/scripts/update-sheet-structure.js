#!/usr/bin/env node
/**
 * Updates Google Sheet structure to match CRM schema.
 * Run: node scripts/update-sheet-structure.js
 * Requires: GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_PATH in .env or env
 */
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

try {
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8").split("\n").forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
  }
} catch (_) {}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

function getAuth() {
  let key;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_PATH) {
    const p = path.resolve(process.cwd(), process.env.GOOGLE_SERVICE_ACCOUNT_PATH);
    key = JSON.parse(fs.readFileSync(p, "utf8"));
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } else {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_PATH or GOOGLE_SERVICE_ACCOUNT_KEY required");
  }
  const auth = new google.auth.GoogleAuth({ credentials: key, scopes: SCOPES });
  return google.sheets({ version: "v4", auth });
}

const TABS = {
  Leads: [
    "id", "name", "city", "company", "email", "phone", "insta_id",
    "bdm", "plan", "status", "source", "remarks", "connected_on",
    "next_follow_up", "committed_date", "original_price", "discount",
    "amount_paid", "amount_balance", "payment_status", "payment_mode",
    "if_part", "created_at", "last_modified",
  ],
  Activity: ["id", "lead_id", "date", "time", "action", "user", "notes", "status", "remarks", "next_connect"],
  Tasks: ["id", "title", "due", "assignee", "done", "lead_id"],
  BDM_Log: ["id", "bdm", "date", "total_calls", "connected_calls", "non_answered_calls", "talk_time"],
  Users: ["id", "username", "password_hash", "role", "assigned_bdm", "team_id"],
  BDMs: ["bdm", "target"],
  Plans: ["plan", "price"],
  Teams: ["team_id", "team_name", "bdm"],
};

async function main() {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SPREADSHEET_ID required");

  const sheets = getAuth();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = (meta.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);

  for (const [tabName, headers] of Object.entries(TABS)) {
    const col = String.fromCharCode(64 + Math.min(headers.length, 26));
    if (existing.includes(tabName)) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:${col}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
      console.log(`Updated headers: ${tabName}`);
    } else {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!A1:${col}1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
      console.log(`Created: ${tabName}`);
    }
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
