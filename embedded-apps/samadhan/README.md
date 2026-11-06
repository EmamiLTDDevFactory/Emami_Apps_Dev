# Samadhan

> **Formerly Setu.** Until v7 the internal name was `setu` (folder `embedded-apps/setu`, `/apps/setu`, `/api/setu`,
> schema `setu`). Everything is `samadhan` now; old links forward (`embedded-apps/setu` is a small redirect stub) and the
> backend still answers on `/api/setu`. Details: `backend/samadhan/README.md`, "Samadhan v7 (schema v7)".

Helpdesk for Emami Secondary Support: tickets from the Microsoft 365 support mailbox or logged by agents,
ticket detail fields, the Category → Function severity matrix, SLA timers on business hours, round-robin
assignment, automations, a Kanban board and the 36-column daily report.

A static-export Next.js app served at `/apps/samadhan`, merged into the hub by `scripts/build-embedded-apps.js`
like every other embedded app. There is no server here: the browser calls the shared Emami Apps backend.

## Backend

The API is `backend/samadhan/` (mounted at `/api/samadhan`), with its own `samadhan` schema in the Emami Apps Postgres.
Its README covers the folder layout, roles, security measures, configuration and scheduled checks:
`backend/samadhan/README.md`.

- Sign-in is the hub session (no login screen here). Access is the **Samadhan** grant in Emami Apps Manage Access;
  its role (Agent / Supervisor / Admin) decides what a person can do.
- While mail is off on the server (`SAMADHAN_MAIL_ENABLED`), replies are saved on the ticket and the header shows
  "Mail off".

## Freshdesk-style features

- **Ways in**: email, the requester **portal** at `/apps/samadhan/portal/` (no Emami Apps login), **WhatsApp** (when connected
  on the server), and **New ticket** for agents logging one on a requester's behalf (their email is required; lookup of
  existing requesters; optional confirmation email).
- **Ticket list**: multi-option filters (status, priority, severity, group, agent, source, type, last activity), a
  **Pending** view, and each ticket's **last activity** (status change, reply, note, call ...), with "Latest activity" sort.
- **Bell** (header): requester replies by default; Admin > Channels & bell sets the events and audience, each agent can
  mute events for themselves.
- **Calls**: Call buttons on every number on the ticket (phone app or Teams), a running timer, and "Log call".
- **Canned responses**: shared ones in Admin, personal ones under **My responses** in the reply box (only the owner sees them).
- **Daily report**: load a date range, filter on any of the 36 columns, preview, then download the matching rows.

## More Freshdesk features (schema v5)

- **Ticket list**: quick views plus More views (my overdue, open in my groups, urgent & high, due today, created today,
  watching, resolved, spam, trash) with live counts; **saved views** (private, or shared by a Supervisor / Admin); filters
  for region, state, depot, sales org, L2 agent, ASM, category, created (relative), resolution / first-response due; 8 sorts;
  **bulk actions** on selected tickets (assign, group, status, priority, add tag, close, merge, watch, spam, trash; restore
  and delete forever from Trash); **Export** to Excel with a column picker (Supervisor / Admin, up to 5,000 rows).
- **Ticket**: Watch (w), Previous / Next in the list (k / j), **Scenarios** (one-click action sets, Admin > Scenarios),
  **Merge** (conversations, calls, time logs and watchers move; later replies to the merged ticket land on the primary),
  **Link** tickets, **child tickets** (one level; a parent resolves after its children), Print, Spam, Trash; "X is
  replying" **collision detection**; **to-dos**; **send and set status**; canned responses fill `{{placeholders}}`;
  **Insert article** from Solutions; the requester's **CSAT** rating.
- **CSAT**: closing a ticket emails the requester a one-click survey (portal page `?csat=<token>`, no sign-in).
- **Dashboard**: due today, unresolved by group, recent activity, my to-dos, CSAT; **Helpdesk dashboard** (region /
  status / type / source / category / depot / state, every bar opens those tickets).
- **Contacts & companies**, **Solutions** (knowledge base; also searchable on the portal), **Analytics** (Supervisor /
  Admin: overview, volume heat-map, agent performance with CSV, territory & category, satisfaction, calls), header
  **search** across tickets, contacts and articles.

## Configuration, roles and personal settings (schema v6)

- **Roles & access** (Admin > People): set anyone in the Emami Apps hub to Agent, Supervisor or Admin, or remove their
  Samadhan access - the same grant as Manage Access, recorded in its access history; Samadhan always keeps one Admin.
- **Admin > General**: helpdesk name / email / phone, portal intro, CSAT question and labels, export limit, default ticket
  view and page size, severity -> priority, extra ticket sources, collision detection on/off, the default dashboard.
- **Statuses** (rename, SLA pause, order, custom statuses), **automation thresholds** (e.g. close after N hours), and the
  **bell**: which events (requester reply, new ticket, assigned, note, @mention, status change, escalation, SLA due soon /
  breached, CSAT, watching) and who sees each (agent, group, everyone).
- **My preferences** (sidebar, or the bell's gear): bell events and email / inbox notifications to turn off, the ticket list's
  start view and page size. The bell filters by unread and by event type.
- **Daily report variants**: columns (chosen and ordered), multi-select filters on every column and the date range saved
  under a name, private or shared; your default variant loads automatically.
- **Dashboard**: choose and order the widgets (Customise); new SLA health, backlog trend, ageing, tickets at risk,
  leaderboard, region x status, open categories and source mix.

## Insights, action points and shortcuts

- **Dashboard > Insights & action points**: headline, prioritised action points, risks and this week's themes for the
  whole queue ("AI" when the backend has an Anthropic key, otherwise "Built-in" rules on the same live data).
- **Ticket > Assist**: live checks on the ticket, and on "Analyse ticket" a summary, a Category -> Function
  suggestion (one-click Apply), likely cause, next steps and a draft reply ("Use in reply" puts it in the reply box).
- **Keyboard**: `/` search, `N` new ticket, `D` dashboard, `T` tickets, `B` board, `?` the list (ignored while typing).

## Frontend layout

```
src/app/            page shell, global styles (shared Emami Apps design tokens), icon
src/app/portal/     requester portal page (no hub sign-in)
src/components/     App (sidebar, top bar, routing), Dashboard, Tickets, TicketView, TicketFields, NewTicket,
                    Board, Reports, Insights (dashboard insights, ticket Assist), Shortcuts, Bell, Calls, MyCanned,
                    Portal, ui (cards, pills, inputs, multi-select), badges (incl. last activity), charts
src/components/admin/  Admin sections: People (agents, groups), Sla (SLA, business hours), Fields (severity
                    matrix, fields), Content (templates, shared canned responses), Distributors, Channels (bell,
                    portal, calling, WhatsApp), System (settings, automations, contacts, audit, parked mail)
src/lib/            api (all backend calls), types, format (IST dates, durations), context, hub session
```

## Development

```bash
npm install
NEXT_PUBLIC_SAMADHAN_API_URL=http://localhost:4000/api npm run dev   # http://localhost:3250/apps/samadhan/
```

Locally the hub and this app are on different origins, so set the hub's session keys in this app's
localStorage (`emami_apps_session_token` = a hub JWT, `emami_apps_user_email` = your email), and add
`http://localhost:3250` to `FRONTEND_ORIGIN` in `backend/.env`. Without `NEXT_PUBLIC_SAMADHAN_API_URL` (the older `NEXT_PUBLIC_SETU_API_URL` also works) the app
uses `https://audit-capa-api.emamiapps.in/api` (and the `/dev-api` prefix on a dev.* host).

```bash
npm run typecheck
npm run build        # static export, moved to dist/
```

Deep link to a ticket: `/apps/samadhan/?ticket=<number>` (used by notifications; `/apps/setu/?ticket=<number>` forwards).
