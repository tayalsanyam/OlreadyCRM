# Gmail care@ inbox → CRM tickets (planned)

> **Status:** Soft spec — not started. Revisit before build.  
> **Last updated:** 2026-06-11  
> **Owner:** Care / grievances  
> **Mailbox:** `care@olready.in` (Google Workspace Gmail)

---

## Problem

Complaints arrive in **two places**:

| Channel | Today |
|---------|--------|
| Public **Submit concern** (`/support`) | Creates `support.tickets` in CRM |
| **Gmail** (`care@`) | Agents work in Gmail; no thread in ticket workspace |

Outbound from CRM uses **Resend** (`lib/resend.ts`, `support.ticket_email_responses`). Customer replies go to **Gmail**, not back through Resend — so the CRM never sees the full conversation unless someone copy-pastes.

---

## Decision: Pattern B (inbox first, promote on intent)

Studied Zendesk, Freshdesk, Front, Hiver-style flows.

| Pattern | Behaviour | Fit for Olready |
|---------|-----------|-----------------|
| **A — Auto-convert** | Every email → ticket immediately | Too noisy for a busy shared inbox |
| **B — Promote when real** | Gmail inbox → tag / promote → ticket | **Chosen** |

**Target workflow:**

```
New email → care@ Gmail
  → Appears in CRM Email Inbox (synced threads)
  → Agent: tag OR "Create complaint" OR "Dismiss"
  → On promote: digest thread → draft ticket (agent fills gaps)
  → Link gmail_thread_id ↔ ticket
  → Further replies on same thread auto-append to ticket (Phase 3)
```

**Dismiss / irrelevant:** Archive in CRM (and optionally Gmail). Do not create a ticket. Prefer archive over hard delete (audit/compliance).

---

## What already exists in codebase

| Asset | Location | Notes |
|-------|----------|--------|
| Ticket create + MUA lookup | `components/grievances/CreateTicketForm.tsx`, `app/api/crm/tickets/intake-lookup/route.ts` | Reuse on promote |
| Outbound email | `lib/resend.ts`, `components/grievances/TicketEmailPanel.tsx` | Phase 3 may switch to Gmail send for threading |
| Public intake | `app/api/public/concerns/route.ts`, `app/support/page.tsx` | Stays separate; dedup in Phase 4 |
| Category sets by submitter | `lib/ticket-categories.ts` | MUA / bride / other categories on public form |
| Grievance workspace | `app/(app)/care/grievances/` | Add inbox route + email timeline panel |
| **Schema (unused)** | `db/migrations/043_support_grievances.sql` | `support.email_integrations`, `support.ticket_email_threads` |
| AI triage | `lib/ticket-ai.ts`, grievance AI panel | Phase 4 reuse |

**Not built yet:** Gmail OAuth, message storage, sync jobs, inbox UI, promote API, label sync.

---

## Threading (industry standard — implement in Phase 1 link + Phase 3 append)

Match replies to tickets using (in order):

1. **Ticket ref in subject/body** — e.g. `[GK-0042]`, `T-202506-0042` (already sent on public ack)
2. **Gmail `threadId`** — stored in `ticket_email_threads.external_thread_id` after first link
3. **Email headers** — `In-Reply-To`, `References`, `Message-ID`
4. **Same sender + open ticket** — fallback only; avoid false merges

Ensure all outbound acks/templates include ticket number in subject for Gmail replies.

---

## Data model (proposed additions)

Existing:

```sql
support.email_integrations   -- provider: resend | gmail
support.ticket_email_threads -- ticket_id, provider, external_thread_id, subject, last_synced_at
support.ticket_email_responses -- CRM-composed outbound (Resend)
```

Add when building:

```sql
-- Inbox queue (pre-ticket or linked)
support.gmail_threads (
  id, gmail_thread_id, subject, snippet,
  from_email, from_name, last_message_at,
  status,              -- unread | linked | dismissed | pending_promote
  ticket_id NULL,      -- set on promote
  labels JSONB,        -- Phase 2
  synced_at, created_at
)

support.ticket_email_messages (
  id, thread_id, ticket_id,
  direction,             -- inbound | outbound
  gmail_message_id,
  from_email, to_emails,
  subject, body_text, body_html,
  sent_at, raw_headers JSONB NULL,
  created_at
)

support.gmail_sync_state (
  id, mailbox, history_id, last_poll_at
)
```

Exact names can change at implementation; keep `external_thread_id` compatible with migration 043.

---

## Phased roadmap

### Phase 1 — Inbox + manual promote

**Goal:** Care stops copy-pasting from Gmail.

| Deliverable | Detail |
|-------------|--------|
| Gmail OAuth | Workspace `care@`; refresh token in env / `email_integrations` |
| Sync | Poll `users.messages.list` (manual “Sync now” OK for MVP; cron later) |
| UI | `/care/email-inbox` — thread list, preview, search |
| Promote | “Create complaint” → slide-over with `CreateTicketForm` pre-filled (from, subject, body, thread text) |
| Link | Insert `ticket_email_threads` + store messages |
| Dismiss | Mark thread dismissed; hide from queue |

**Effort (1 full-stack dev):** 8–12 dev days (~2–2.5 weeks)  
**Lean MVP:** ~5–6 days (no attachments, manual sync only, minimal dismiss UI)

---

### Phase 2 — Labels / tags

**Goal:** Tag in Gmail or CRM drives workflow.

| Deliverable | Detail |
|-------------|--------|
| Gmail labels | e.g. `Olready/Complaint`, `Olready/Dismissed` |
| CRM tags | Apply from inbox; optional write-back to Gmail |
| Rules | Label `Complaint` → queue for digest / highlight in inbox |
| Filters | Inbox views by tag/status |

**Effort:** 5–8 dev days (~1–1.5 weeks)  
**Note:** Two-way label sync is harder than one-way (CRM → Gmail). Start one-way.

---

### Phase 3 — Auto-append + outbound

**Goal:** Linked threads stay in sync; reply from CRM in same Gmail thread.

| Deliverable | Detail |
|-------------|--------|
| Poll linked threads | Cron 2–5 min; append new messages to ticket timeline |
| Ticket UI | Email thread panel on grievance detail (alongside `TicketEmailPanel`) |
| Send | Prefer **Gmail API send** with `threadId` + proper headers; or threaded Resend + inbound catch |

**Effort:** 8–10 dev days (~1.5–2 weeks)

---

### Phase 4 — AI on promote

**Goal:** Faster triage when promoting email → ticket.

| Deliverable | Detail |
|-------------|--------|
| Summary | Thread digest for complaint field |
| Category guess | MUA / bride / other + category |
| MUA match | Email/phone → `intake-lookup` |
| Dedup warning | Open ticket same sender / similar subject |

**Effort:** 3–5 dev days (~1 week) — mostly wiring existing AI

---

## Effort summary

| Scope | Dev days | Calendar (1 dev) |
|-------|----------|------------------|
| Phase 1 | 8–12 | ~2–2.5 weeks |
| Phase 2 | 5–8 | ~1–1.5 weeks |
| Phase 3 | 8–10 | ~1.5–2 weeks |
| Phase 4 | 3–5 | ~1 week |
| **Total (1→4)** | **24–35** | **~5–7 weeks** |

Two devs (backend sync + frontend inbox in parallel): ~**3–4 weeks** to complete Phase 3.

**First daily-use milestone:** end of **Phase 1**.

---

## Suggested build slices (when we start)

| Slice | Outcome | ~Days |
|-------|---------|-------|
| **1a** | OAuth + thread list + manual sync | 4 |
| **1b** | Promote → ticket + thread link | 4 |
| **1c** | Dismiss + show messages on ticket | 2 |
| **2** | Labels (CRM → Gmail first) | 5–8 |
| **3** | Auto-append + Gmail reply | 8–10 |
| **4** | AI on promote | 3–5 |

---

## Env / ops (placeholder)

```env
# Phase 1 — Google Cloud OAuth (Workspace)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_GMAIL_REFRESH_TOKEN=   # or store in support.email_integrations
GMAIL_CARE_MAILBOX=care@olready.in
GMAIL_SYNC_CRON_SECRET=       # optional, for /api/cron/gmail-sync
```

Requires Google Cloud project + Workspace admin consent for Gmail API scopes (`gmail.readonly` Phase 1; `gmail.send` + `gmail.modify` Phase 2–3).

---

## Risks

| Risk | Mitigation |
|------|------------|
| Workspace admin delay | Start OAuth early; use test mailbox |
| Ticket spam if auto-create all | Stick to Pattern B (promote) |
| Duplicate ticket (email + public form) | Phase 4 dedup; show warning on promote |
| Resend vs Gmail dual outbound | Phase 3: single send path (Gmail) for care replies |
| Attachments / MIME complexity | Defer to Phase 1b+ or limit to text-first MVP |
| Pub/Sub vs poll | Poll for MVP; Pub/Sub for production scale |

---

## Related docs / code

- Grievance schema: `db/migrations/043_support_grievances.sql`
- Care contact: `lib/care-contact.ts` (`care@olready.in`)
- Public concerns: `app/api/public/concerns/route.ts`
- Implementation plan (historical): `docs/CURSOR_IMPLEMENTATION_PLAN.md`

---

## Open questions (resolve at kickoff)

1. Auto-create for emails with `[GK-xxxx]` in subject only (hybrid), or always manual promote?
2. Attachments required in Phase 1 or Phase 2?
3. Who owns Gmail label taxonomy — ops or eng?
4. Should care-created tickets support bride/other categories (internal form), not only MUA?
5. Retention: how long keep dismissed threads in CRM?

---

## Changelog

| Date | Note |
|------|------|
| 2026-06-11 | Initial soft spec from product/architecture discussion (Pattern B, phases 1–4, effort estimates) |
