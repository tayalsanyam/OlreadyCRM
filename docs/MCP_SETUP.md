# MCP Setup for Olready CRM

## Supabase MCP

**Config:** `.cursor/mcp.json` uses hosted URL:
```json
"supabase": {
  "url": "https://mcp.supabase.com/mcp?project_ref=bqfdcnbcqhasxylpnlfs"
}
```

**Auth:** Cursor prompts browser login to Supabase on first connect. No PAT needed.

**If MCP tools don't appear:** Use the schema script instead:
```bash
cd crm && node scripts/describe-schema.js
```
Outputs tables, columns, row counts from live Supabase (uses `.env` credentials).

## Task Master MCP

- **YOUR_OPENAI_KEY**: OpenAI API key (or `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY` per [task-master-ai](https://www.npmjs.com/package/task-master-ai))

## Verify

- Supabase: "What tables are in my database?" (MCP) or `node scripts/describe-schema.js`
- Task Master: Initialize projects, list tasks, parse PRDs
