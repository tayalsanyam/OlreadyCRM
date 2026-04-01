# Twenty & Frappe CRM Benchmark – Best Bits for Olready

In-depth comparison of Twenty and Frappe CRM on payment/accounting, tasks, follow-ups, emails, lead form, stage change, and daily UI. Recommendations for Olready.

---

## 1. Payment & Accounting

### Twenty
- **No native accounting**. Uses workflows + API/webhooks to send deal data to external tools (Stripe, QuickBooks, Xero).
- **Trigger**: Record Updated (Opportunity) → Filter: Stage = Closed Won → Search Record (Company) → Code (format payload) → HTTP Request.
- **Flow**: Deal won → emit payload to invoicing API. Store returned invoice ID back on Opportunity via Update Record.
- **Pros**: Clean, extensible, no accounting bloat.
- **Cons**: Requires external system; no built-in payment tracking.

### Frappe
- **Integrates with ERPNext** for invoicing, accounting, quotations.
- **Create Quotation**: Button on Deal header → pre-fills ERPNext Quotation from deal.
- **Auto Customer**: On Deal status = Won (configurable) → create Customer in ERPNext with contacts/org address.
- **Same site** or **separate site** (API key/secret).
- **Pros**: Full accounting if you run ERPNext.
- **Cons**: Heavy dependency; not useful without ERPNext.

### Olready Recommendation
| Approach | Use When |
|----------|----------|
| **Native payment tracking** (current) | Keep Payment Pending tab, amount_paid, balance, modes. |
| **Webhook on PAID** | Add optional webhook when lead → PAID: send payload to external invoicing (Stripe, QuickBooks, Xero). |
| **API-first** | Expose REST/GraphQL for external tools like Twenty. |
| **ERPNext-style** | Skip unless you adopt ERPNext. |

**Add to plan**:
- Webhook on status → PAID (configurable URL, payload: lead_id, name, amount, bdm, etc.).
- Optional “Create Invoice” button for PAID leads → opens external invoicing URL or triggers workflow.

---

## 2. Tasks & Follow-ups

### Twenty
- **Tasks** with Relations field: link to Person, Company, Opportunity, Notes.
- **Upcoming / Done** toggle on Tasks page.
- **Side panel** on task click: assignee, due date, comments.
- **Rich content**: titles, bullets, images via `/` commands.
- **Automated creation**: Workflows (e.g. Deal Won → create onboarding tasks).
- **Record page**: Tasks tab, Add Task button.
- **Quick create**: Cmd+K → Create task.

### Frappe
- **Task**: title, description, status (Backlog, Todo, In Progress, Done, Canceled), assignee, due date, priority.
- **List view**: filter, sort.
- **Lead/Deal page**: Activity tab with “New” → create Note or Task.
- **Notes → Tasks**: Create tasks from notes for follow-up actions.
- **Call logs**: Note button during call for real-time capture.

### Olready Recommendation
| Feature | Source | Action |
|---------|--------|--------|
| Task status | Frappe | Add `status` (Backlog, Todo, In Progress, Done, Canceled) instead of only done boolean. |
| Priority | Frappe | Add `priority` (High, Medium, Low). |
| Description | Both | Add `description` to tasks. |
| Tasks on lead page | Both | Add Tasks subsection on lead detail (like Activity). |
| Create task from lead | Current | Keep auto-create on next_follow_up. |
| Quick add | Twenty | Cmd+K or “+ Add Task” on lead page. |

---

## 3. Emails for Daily Updates

### Twenty
- **Workflows**: e.g. “Send Email Alerts with Tasks Due”.
- **Trigger**: Scheduled (e.g. every Monday) + Filter (tasks due this week).
- **Action**: Send email to task assignees.
- **No built-in daily digest**; workflows assemble it.

### Frappe
- **Email templates**: Jinja-based, reusable across DocTypes.
- **Usage**: “Email Template” button in compose → paste template, edit.
- **Scheduled reports**: Frappe has scheduled email reports; CRM uses same.

### Olready Recommendation
| Feature | Description |
|---------|-------------|
| **Daily digest email** | Cron/scheduled job: tasks due today, overdue, follow-ups today → email to BDM (or all). |
| **Email templates** | Jinja-like templates for: follow-up reminder, payment reminder, welcome. |
| **Config** | Admin setting: enable/disable digest, who receives (BDM only vs all). |

**Implementation**:
- Add `api/cron/daily-digest` (or Next.js route called by external cron).
- Query: tasks due today + overdue, leads with next_follow_up today.
- Send via Resend/SendGrid/Nodemailer.
- Store templates in DB or config.

---

## 4. Lead Form Structure

### Twenty
- **Record page**: Header with name, then tabs/sections.
- **Fields**: Layout driven by metadata; relation fields, custom props.
- **Edit in place** or side panel.

### Frappe
- **All-in-one Lead/Deal page**: Details, Activities, Notes, Tasks, Comments in tabs.
- **Header actions**: Create Quotation, View Customer (when ERPNext enabled).
- **Form Scripts**: Custom actions (e.g. show buttons based on status).

### Olready Current
- **Lead detail**: Details | Payment (read-only) | Edit | Activity.
- **New lead**: Single long form; all fields in one view.

### Olready Recommendation

**Lead form (new/edit) – sections**:
1. **Contact** (required): name, city, company, phone, email, insta_id.
2. **Assignment**: bdm, plan, source.
3. **Pipeline**: status, remarks, connected_on, next_follow_up, committed_date.
4. **Pricing** (when status ≥ Confirmed): original_price, discount.
5. **Notes**: remarks (large text).

**Lead detail page – tabs/sections**:
1. **Details** – read-only core + edit button to open form.
2. **Activity** – log (existing).
3. **Tasks** – list + Add Task (new).
4. **Payment** – read-only; “Record in Payment Pending” link.
5. **Edit** – inline or slide-over for Status, Remarks, Next connect, etc.

**Validation**:
- Required on save: status, remarks, next_follow_up (or stage change justification).
- On stage change to CONFIRMED: require original_price or discount context.

---

## 5. Stage Change Behavior

### Twenty
- **Kanban**: Drag card → stage updates.
- **Workflows**: Trigger on Record Updated → Filter by stage.
- **No built-in validations**; workflows can branch on stage.

### Frappe
- **crm_status_change_log**: Logs status changes.
- **Deal Won**: Triggers ERPNext customer creation (if enabled).
- **Form Scripts**: Custom logic (e.g. show Create Quotation only when Won/Lost).

### Olready Recommendation

| Stage change | Behavior |
|--------------|----------|
| **Any → any** | Log in Activity: “Status changed from X to Y”. |
| **→ CONFIRMED** | Optional: prompt for original_price, discount if not set. |
| **→ PAID** | Only via Record Payment (Payment Pending). Not via manual status edit. |
| **→ DENIED** | Allow; optional “Lost reason” field. |
| **CONFIRMED → PAID** | Block direct edit; must go through Payment Pending flow. |

**Implement**:
- `status_change_log` or Activity entry on every status change.
- On lead PATCH: if status changed → insert Activity `action: 'status_change'`, `notes: 'X → Y'`.
- Validation: prevent status = PAID unless coming from payment flow.

---

## 6. Daily UI – Tasks, Follow-ups, Emails

### Twenty
- **Tasks page**: Upcoming / Done; filter by assignee.
- **Record page**: Task tab shows linked tasks.
- **Dashboard**: Today’s actions, tasks due.

### Frappe
- **All-in-one Lead/Deal page**: Activity tab = notes, tasks, calls.
- **Tasks list**: Central hub; filter, sort.
- **Dashboard**: Custom widgets.

### Olready Recommendation

**Dashboard section “Today’s Action”**:
- Follow-ups due today (next_follow_up).
- Tasks due today, overdue.
- Confirmed leads with committed_date today.
- Count badges, link to filtered views.

**Tasks page**:
- Tabs: Pending | Done (current).
- Add: **Overdue** highlight (already present).
- Add: **Filter by assignee** (BDM).
- Add: **Priority** column.
- Add: **Link to lead** (already present).

**Lead detail page**:
- Add **Tasks** block: list tasks for this lead, Add Task.
- Add **Next follow-up** prominent (already in edit).
- **Activity** section: keep; add “Status changed” entries.

**Email digest**:
- Daily (or weekly) email: tasks due, overdue, follow-ups today.
- Optional: BDM-specific only.

---

## 7. Best Bits Summary

| Area | From Twenty | From Frappe | Olready Add |
|------|-------------|-------------|-------------|
| **Payment** | Webhook on deal won | — | Webhook on PAID |
| **Tasks** | Relations, Record tab | Status, Priority, Activity tab | Status, Priority, Tasks on lead |
| **Emails** | Workflow-based digest | Email templates | Daily digest + templates |
| **Lead form** | Tabbed record page | All-in-one, Form Scripts | Sectioned form, tabs |
| **Stage change** | Workflow triggers | Status log, ERPNext | Activity log, validation |
| **Daily UI** | Tasks filter, Record tasks | Activity tab, Tasks list | Today’s Action, Tasks on lead |

---

## 8. Implementation Order

1. **Tasks on lead page** – Add Tasks subsection, Add Task.
2. **Task schema** – status, priority, description.
3. **Stage change logging** – Activity entry on status change.
4. **Lead form sections** – Group fields; validation on CONFIRMED.
5. **Dashboard Today’s Action** – Follow-ups, tasks, commitments.
6. **Webhook on PAID** – Configurable URL, payload.
7. **Daily digest** – Cron, templates, Resend/SendGrid.
8. **Email templates** – Store, use in digest and future flows.
