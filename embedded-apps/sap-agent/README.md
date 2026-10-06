# SAP Agent (embedded app)

Hub tile **SAP Agent** (category IT, `/apps/sap-agent`, Manage Access app id `sap-agent`). A web front end for
**sap-agent**, the AI agent that creates, changes, checks, tests and activates ABAP objects on the SAP **development**
system (see [server/README.md](server/README.md) for what it can build and its safety rails).

```
browser (hub origin, /apps/sap-agent)  --Bearer / SSE-->  sap-agent.emamiapps.in/dev  (nginx)
                                                              -> PM2 sap-agent-dev 127.0.0.1:4130  (server/, Python)
                                                                   |-- ADT REST  https://10.17.10.12:4440/sap/bc/adt/...
                                                                   |-- task handler /sap/zsrc_agent/tasks
                                                                   +-- Anthropic API (model)
```

- **UI** (`src/`): static Next.js export like every sibling app; built and merged by `scripts/build-embedded-apps.js`.
  Agent (task in words, live timeline of model messages and tool calls), Deploy (bundled manifests, dry run first),
  Runs (history), Health (connection, doctor, capabilities), Audit log.
- **Server** (`server/`): your `sap_agent` engine, **unchanged** (guard, audit, ADT client, task handler client, agent
  loop, deploy runner, 78 tests), plus `sap_agent_web/`, a FastAPI layer that wires the engine to the web:
  - sign-in: the hub session token is verified with the hub's `HUB_AUTH_JWT_SECRET` and the Manage Access role must be
    **Admin** on `sap-agent`; the server then issues its own 12 h session token;
  - one run at a time (task, deploy, bootstrap, doctor) with an append-only event stream (server-sent events);
  - approvals: whenever the guard or the agent asks for approval, the run pauses and the admin types **yes** in the
    browser (denied after `APPROVAL_TIMEOUT_S`, default 15 min); cancel stops the run between tool calls;
  - the audit log names the person: actor `<email> (as ZSRC_AGENT)`;
  - deploy only runs manifests under `server/projects/` (no uploads); transports are never released from the web.

Secrets (SAP password, Anthropic key, session secret) exist only in `server/.env` on the box - never in the browser.

## Server: run, test, deploy

```bash
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q                      # engine + web tests (83)
cp .env.example .env                               # fill in, see below
.venv/bin/python -m uvicorn sap_agent_web.app:app --host 127.0.0.1 --port 4130
```

On 172.17.2.21: `~/apps/sap-agent-dev/server`, PM2 process `sap-agent-dev`
(`pm2 start .venv/bin/python --name sap-agent-dev -- -m uvicorn sap_agent_web.app:app --host 127.0.0.1 --port 4130`),
bound to localhost; nginx template: `server/deploy/nginx-sap-agent.emamiapps.in.conf`.

`.env` (server/.env.example has every key): `SAP_HOST`, `SAP_CLIENT`, `SAP_USER` / `SAP_PASSWORD` (technical user
`ZSRC_AGENT`), `SAP_ALLOWED_SIDS`, `SAP_ALLOWED_PACKAGES`, `ANTHROPIC_API_KEY`, `HUB_AUTH_JWT_SECRET` (the matching hub's),
`SESSION_SECRET`, `HUB_ACCESS_API_BASE`, `ALLOWED_ORIGINS`.

## UI

`npm run dev` (http://localhost:3220/apps/sap-agent/) talks to http://localhost:4130 - e.g. an SSH tunnel to the box,
or a local server started with `ALLOW_DEV_LOGIN=true` (never on a server). Override with `NEXT_PUBLIC_SAP_AGENT_API`.

## Before the first real run

1. DNS: `sap-agent.emamiapps.in` -> same IP as `audit-capa-api.emamiapps.in`; then install the nginx site and certbot.
2. SAP: user `ZSRC_AGENT` with role `Z_SRC_AGENT`; `sap-agent bootstrap` (Deploy -> bootstrap) and the SICF node
   `/sap/zsrc_agent/tasks` (currently 404 on NGD), STVARV `ZSRC_AGENT_SIDS` / `ZSRC_AGENT_PACKAGES` (server/README.md).
3. Server `.env`: `SAP_PASSWORD`, `SAP_CLIENT`, `ANTHROPIC_API_KEY`.
4. Manage Access: give the Admin role on **SAP Agent** to the people who may use it.
