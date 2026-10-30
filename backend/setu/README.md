# Setu backend

API for **Samadhan** (Emami Secondary Support helpdesk), mounted at `/api/setu` by `backend/server.js`.
Users see the app as **Samadhan**; `setu` stays the internal name (app id in Manage Access, schema, routes, folders).
The frontend lives in `embedded-apps/setu`. Data lives in its own `setu` Postgres schema.

## Layout

```
backend/setu/
  index.js               router: scheduler route, then sign-in + rate limit, then the feature routes
  constants.js           roles, statuses, priorities, editable fields, mail settings
  db/
    schema.js            CREATE SCHEMA / TABLE / INDEX IF NOT EXISTS (30 tables)
    seed.js              base configuration, inserted only when missing (Admin edits are never overwritten)
    ready.js             startup promise every request waits for
    install.sql          the same schema + seed as one script, for a DBA install (see "Database")
  lib/                   business logic, no HTTP
    businessHours.js     working-time arithmetic in Asia/Kolkata, holidays (calendar cached for 1 min)
    sla.js               targets per group / priority, due dates, pause time
    severity.js          Category -> Function severity matrix
    assignment.js        round robin within a group (row lock, Available agents only)
    automation.js        rule conditions (all / any, operators, time measures)
    tickets.js           create, update, replies / notes / forwards, automation actions
    notify.js            email templates, requester mail, agent notifications (Emami Apps inbox)
    mail.js              Microsoft Graph send, subject parsing, noise filter, sender verification
    mailIngest.js        support mailbox -> tickets (one message never blocks the rest)
    insights.js          insights & action points: live checks (rules) + analysis (AI, or rules without a key)
    ai.js                Claude client: structured JSON output, refusal fallback, caching, personal-data masking
    jobs.js              scheduled checks: SLA reminders / violations, time automations, mailbox intake
    queries.js, util.js  shared SQL fragments, helpers, error handling
  middleware/
    auth.js              hub session token + 'setu' grant + role; deactivated agents blocked
    rateLimit.js         per-person request limits
    bell.js              in-app bell: which events, who sees them, per-agent mute
    canned.js            shared (Admin) and personal (one agent only) canned responses
    whatsapp.js          WhatsApp Cloud API: webhook signature, inbound messages, sending replies
    whatsappIngest.js    WhatsApp message -> new ticket or reply on the sender's open WhatsApp ticket
  routes/                me.js (+ bell, preferences, personal canned, contact search), tickets.js (+ calls), reports.js
                         (board, dashboard, daily report), insights.js, admin.js, jobs.js,
                         public.js (requester portal + WhatsApp webhook: no hub sign-in, their own limits)
  tests/                 unit.test.js (no DB), api.test.js (end to end, local DB only), mock-anthropic.js
                         (AI stand-in for tests) - see tests/README.md
```

## Access

Sign-in is the Emami Apps hub session (no separate login). Access is the **setu** grant in Manage Access; the
grant's role decides what a person can do:

| Role | Can |
| --- | --- |
| Agent | work any ticket: reply, note, forward, change fields and status, board, new tickets, time log |
| Supervisor | Agent + daily report (it contains requester phone numbers and emails) |
| Admin | Supervisor + Admin screens and "Run scheduled checks now" |

An Admin can deactivate a Setu agent (Admin > Agents); a deactivated agent is refused even with a grant.

## Channels, last activity, bell, calls

- **Ways in**: email (support mailbox), the **requester portal** (`/apps/setu/portal/`, no Emami Apps login: name + email
  required, acknowledgement emailed, status check by ticket number + email), **WhatsApp** (Meta Cloud API webhook,
  replies go back on WhatsApp), and agents logging a ticket on someone's behalf (requester email required).
- **Last activity** on every ticket (created, status change, assignment, agent / requester reply, note, forward, call):
  shown in the list, filterable and sortable.
- **Bell** in the Setu header: Admin > Channels & bell picks the events (default: requester replies only) and who sees
  them (the ticket's agent, its group, or everyone); each agent can mute events for themselves. Kept 30 days.
- **Calls**: Call buttons (tel: or Microsoft Teams, Admin's choice) on every number on the ticket, and a call log
  (direction, outcome, length, notes) shown in the conversation.
- **Canned responses**: shared ones (Admin) plus personal ones per agent that nobody else - Admins included - sees.
- **Multi-option filters** on the ticket list (status, priority, severity, group, agent, source, type, last activity)
  and a **Pending** view; the daily report can be filtered on any of its 36 columns before download.

## Insights and action points

- **Dashboard** (`GET /api/setu/insights/dashboard`): a headline, themes, risks and prioritised action points for the
  whole queue, from live numbers (overdue, unassigned per group, agent availability, category spikes week on week,
  distributors with repeat tickets, tickets waiting on requesters, SLA breach rate). Shared by everyone and kept for
  30 minutes; a Supervisor or Admin can refresh it.
- **Ticket** (`GET /api/setu/tickets/:id/insights`): live checks (first response / resolution due or overdue,
  unassigned, requester waiting for a reply, fatal not escalated, fields missing before resolving, repeat
  distributor). With `?generate=1` (the "Analyse ticket" button): summary, sentiment, a Category -> Function
  suggestion from the configured list only (one click to apply), likely root cause, next steps and a draft reply the
  agent can put in the reply box and edit. Kept until the ticket changes.
- **AI**: Claude (`claude-opus-5-5`) through the Anthropic SDK, when `ANTHROPIC_API_KEY` is set on the backend (the
  same key the rest of the backend uses). Without a key, or if the AI declines or is unavailable, the same screens
  are filled by built-in rules and marked "Built-in" - nothing breaks. Answers are constrained to a JSON schema;
  email addresses and phone numbers are masked before anything is sent; ticket text is treated as data, not
  instructions; suggestions are always checked against Setu's own lists before they are shown. Nothing the AI
  writes is sent or saved on a ticket without an agent choosing to.
- **Cost control**: analysis runs only when an agent asks; results are cached (ticket until it changes, dashboard
  30 minutes); the stable system prompt is prompt-cached; new AI requests are limited to 20 per person per minute.

## Security measures

- **Authentication**: hub JWT, HS256 only, expiry enforced; purpose-bound tokens signed with the same secret (the
  emailed magic sign-in link) are refused; the email in the token must be well formed.
- **Authorisation**: every route requires the grant; Supervisor / Admin checks on the server, not just hidden in the UI.
- **Input**: every write goes through an allow-list of fields with length limits; numbers, dates, emails and enums
  validated; unknown statuses / agents / groups rejected; all SQL parameterised (sort orders from a fixed list).
- **Concurrent edits**: the ticket screen sends the version it loaded; a save over someone else's newer change is
  refused with 409 instead of silently overwriting it.
- **Rate limiting** (per signed-in person, per backend copy): 300 reads, 60 writes and 10 heavy calls (report,
  distributor upload, scheduled checks) a minute; 429 with Retry-After beyond that. Never keyed on IP address,
  because the whole office shares one. The API Gateway throttling in front of the backend is the outer layer.
- **Email content**: stored as received, sanitised in the browser (DOMPurify) - no scripts, handlers, forms,
  frames or positioned overlays; email boxes are paint-contained; remote images (tracking pixels) are held back
  until the agent clicks "Show images". Agent-typed text is HTML-escaped. Template placeholders are escaped.
- **Mailbox abuse**: only the requester or someone already on the thread can add to a ticket; replies whose sender
  fails SPF / DKIM / DMARC are parked, not threaded; more than 20 new tickets an hour from one sender are parked;
  auto-replies and notification loops are parked; ticket numbers in subjects are bounded.
- **Excel report**: cells that would start a formula (= + - @) are neutralised.
- **Portal** (no sign-in): a honeypot field for bots; 5 tickets per 10 minutes per client address, 10 per email a day and
  300 an hour in all; status lookup needs the ticket number and the requester's email and returns no ticket text.
- **WhatsApp webhook**: every POST must carry Meta's `X-Hub-Signature-256` for the app secret (checked against the body
  as Meta serialises it, so the shared server's JSON parser is not changed); the GET verification needs the verify token.
- **Personal canned responses** and the **bell** are scoped to the signed-in agent on the server.
- **Privacy**: Admin > Contacts removes a person's name, email and phone, their words on their tickets, and their
  address from conversations, activity and parked mail. Logs never contain email addresses or message text.
- **Audit**: admin changes, report downloads and contact removal are written to `setu.audit_events`
  (Admin > Audit log); every ticket change, automation and email is in the ticket's activity log.
- **Errors**: unexpected errors return a generic message; details go to the server log only.

## Performance

- Backend cold start: the schema / seed setup runs only when its version changes (one query otherwise).
- SLA policies, the severity matrix and the business calendar are cached in memory for a minute and cleared the
  moment an Admin edits them, so ticket changes no longer re-read them each time.
- The scheduled SLA check asks Postgres only for tickets that are due soon or late and not yet flagged, instead of
  loading every open ticket.
- Partial indexes on open tickets' due times, a GIN index for tag filters, indexes for agent + status, last update,
  distributor and sender email.
- Frontend: Admin, Board and the report load only when opened; the spreadsheet library loads only for an export or
  upload; one shared clock drives every SLA countdown; the dashboard stops refreshing while its tab is hidden and
  catches up when the agent comes back; search waits for typing to pause.

## Scale and reliability

- Stateless request handling: any number of backend copies (Lambda instances) can serve Setu at once.
- Scheduled checks run under a Postgres advisory lock and a shared "last run" time, so only one copy runs them
  and nobody gets duplicate reminders or double automation actions.
- Round-robin assignment locks the group row, so two simultaneous new tickets never go to the same agent by race.
- Indexes on status, agent, group, created time, requester and Category / Function; lists are paginated (max 200),
  the board is capped at 600 open tickets.
- Each Lambda copy holds up to 10 database connections (`backend/db.js`). If Setu traffic grows to many
  concurrent copies, put RDS Proxy / PgBouncer in front of Postgres.

## Configuration (backend environment)

| Variable | Purpose |
| --- | --- |
| `PGHOST` `PGPORT` `PGDATABASE` `PGUSER` `PGPASSWORD` | shared Emami Apps Postgres (already set for the backend) |
| `HUB_AUTH_JWT_SECRET` | hub session signing secret (already set) |
| `HUB_INTERNAL_API_SECRET` | lets a scheduler call `POST /api/setu/jobs/run` with header `x-internal-secret` |
| `SETU_MAIL_ENABLED` | `true` to read the support mailbox and email requesters; default `false` (replies are saved, no mail) |
| `SETU_MAILBOX` | support mailbox address (default `emami.helpdesk@emamigroup.com`) |
| `ANTHROPIC_API_KEY` | turns on AI analysis (already used by other backend modules); unset = built-in insights only |
| `SETU_AI_ENABLED` | `false` switches Setu's AI off even when a key is set (default on) |
| `SETU_WHATSAPP_ENABLED` | `true` to connect WhatsApp (default off: WhatsApp replies are saved on the ticket only) |
| `SETU_WHATSAPP_TOKEN` / `SETU_WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API access token and the helpdesk number's id |
| `SETU_WHATSAPP_APP_SECRET` | Meta app secret - webhook signatures are checked with it |
| `SETU_WHATSAPP_VERIFY_TOKEN` | any string; enter the same one in Meta when adding the webhook `https://<api>/api/setu/whatsapp/webhook` |
| `SETU_WHATSAPP_API_VERSION` | Graph API version (default `v21.0`) |

Mail uses the Microsoft Graph app registration from `backend/ccbTeams.js`; it needs the **Mail.ReadWrite** and
**Mail.Send** application permissions, ideally limited to the support mailbox with an Exchange application
access policy. Agent notifications go through `backend/notifications.js` (hub bell + Outlook).

## Database

On first start the backend creates the `setu` schema, tables and base configuration itself. If the backend's
database user may not create schemas, or the database is not reachable from where you are, a DBA can run
`db/install.sql` once instead (it refuses to run twice). Ticket numbers start at 100000.

## Scheduled checks

They run on normal traffic at most every 5 minutes, and every 5 minutes in a long-running backend. For a fixed
schedule, have EventBridge (or any scheduler) call:

```
POST https://<api>/api/setu/jobs/run
x-internal-secret: <HUB_INTERNAL_API_SECRET>
```

## Tests

See `tests/README.md`. Unit tests: `node --test backend/setu/tests/unit.test.js`.
