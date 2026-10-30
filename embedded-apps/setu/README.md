# Setu Helpdesk

Helpdesk for Emami Secondary Support: tickets from the Microsoft 365 support mailbox or logged by agents,
ticket detail fields, the Category → Function severity matrix, SLA timers on business hours, round-robin
assignment, automations, a Kanban board and the 36-column daily report.

A static-export Next.js app served at `/apps/setu`, merged into the hub by `scripts/build-embedded-apps.js`
like every other embedded app. There is no server here: the browser calls the shared Emami Apps backend.

## Backend

The API is `backend/setu/` (mounted at `/api/setu`), with its own `setu` schema in the Emami Apps Postgres.
Its README covers the folder layout, roles, security measures, configuration and scheduled checks:
`backend/setu/README.md`.

- Sign-in is the hub session (no login screen here). Access is the **setu** grant in Emami Apps Manage Access;
  its role (Agent / Supervisor / Admin) decides what a person can do.
- While mail is off on the server (`SETU_MAIL_ENABLED`), replies are saved on the ticket and the header shows
  "Mail off".

## Freshdesk-style features

- **Ways in**: email, the requester **portal** at `/apps/setu/portal/` (no Emami Apps login), **WhatsApp** (when connected
  on the server), and **New ticket** for agents logging one on a requester's behalf (their email is required; lookup of
  existing requesters; optional confirmation email).
- **Ticket list**: multi-option filters (status, priority, severity, group, agent, source, type, last activity), a
  **Pending** view, and each ticket's **last activity** (status change, reply, note, call ...), with "Latest activity" sort.
- **Bell** (header): requester replies by default; Admin > Channels & bell sets the events and audience, each agent can
  mute events for themselves.
- **Calls**: Call buttons on every number on the ticket (phone app or Teams), a running timer, and "Log call".
- **Canned responses**: shared ones in Admin, personal ones under **My responses** in the reply box (only the owner sees them).
- **Daily report**: load a date range, filter on any of the 36 columns, preview, then download the matching rows.

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
NEXT_PUBLIC_SETU_API_URL=http://localhost:4000/api npm run dev   # http://localhost:3250/apps/setu/
```

Locally the hub and this app are on different origins, so set the hub's session keys in this app's
localStorage (`emami_apps_session_token` = a hub JWT, `emami_apps_user_email` = your email), and add
`http://localhost:3250` to `FRONTEND_ORIGIN` in `backend/.env`. Without `NEXT_PUBLIC_SETU_API_URL` the app
uses `https://audit-capa-api.emamiapps.in/api` (and the `/dev-api` prefix on a dev.* host).

```bash
npm run typecheck
npm run build        # static export, moved to dist/
```

Deep link to a ticket: `/apps/setu/?ticket=<number>` (used by notifications).
