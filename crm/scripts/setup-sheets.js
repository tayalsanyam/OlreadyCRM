#!/usr/bin/env node
/**
 * First-time setup instructions.
 * Run: node scripts/setup-sheets.js
 * Or configure env and hit /login - if no admin exists, setup form will appear.
 */
console.log(`
=== Olready CRM – Google Sheets Setup ===

1. Create a Google Sheet at https://sheets.google.com

2. Share the Sheet with your service account email (Editor access):
   olreadycrm@olready-crm.iam.gserviceaccount.com

3. Copy the Sheet ID from the URL:
   https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit

4. Create .env in the crm folder:
   GOOGLE_SPREADSHEET_ID=your_sheet_id
   GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'  (full JSON)
   SESSION_SECRET=random-32-char-string

5. Run: npm run dev
   Visit http://localhost:3000/login
   If no admin exists, create one. Tabs will be created automatically.
`);
