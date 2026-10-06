# SAP Agent (embedded app)

Hub tile **SAP Agent** (category IT, `/apps/sap-agent`, Manage Access app id `sap-agent`). A web front end for
**sap-agent**, the AI agent that creates, changes, checks, tests and activates ABAP objects on the SAP **development**
system (see [server/README.md](server/README.md) for what it can build and its safety rails).

```
browser (hub origin, /apps/sap-agent)  --Bearer / SSE-->  audit-capa-api.emamiapps.in/dev-api/sap-agent/  (nginx)
                                                              -> PM2 sap-agent-dev 127.0.0.1:4130  (server/, Python)
                                                                   |-- ADT REST  EDS https://10.17.10.13:4440/sap/bc/adt/...
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

**Target system: EDS** (`emamidev.emami.local`, 10.17.10.13, instance 00, HTTPS 4440 - the box cannot resolve the
name, so `SAP_HOST` uses the IP). Package **ZEMAMI** (`SAP_ALLOWED_PACKAGES`), `SAP_ALLOWED_SIDS=EDS`.

**Per-person sign-in.** After the hub sign-in (Admin role), each person enters **their own SAP user ID and password**
(optional client) and **their Anthropic API key**. The server checks them - the system id from `/sap/public/info` must
be an allowed one, ADT discovery must accept the login, Anthropic must accept the key - and keeps them **only in memory
for that session** (`sap_agent_web/vault.py`): never written to disk, never logged, never sent back to the browser,
dropped on SAP sign-out, session expiry or a server restart. Every run uses the credentials of the person who started
it, so SAP's own authorisations apply, and the audit actor is `<email> (as <SAP user>)`. The server `.env` holds no SAP
user, password or Anthropic key.

## Server: run, test, deploy

```bash
cd server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q                      # engine + web tests (83)
cp .env.example .env                               # fill in, see below
.venv/bin/python -m uvicorn sap_agent_web.app:app --host 127.0.0.1 --port 4130
```

On 172.17.2.21: `~/apps/sap-agent-dev/server`, PM2 process `sap-agent-dev`
(`pm2 start .venv/bin/python --name sap-agent-dev -- -m uvicorn sap_agent_web.app:app --host 127.0.0.1 --port 4130`),
bound to localhost; nginx: `location /dev-api/sap-agent/` in the existing `audit-capa-api.emamiapps.in` site (strip
prefix, `proxy_buffering off`, `proxy_read_timeout 1h`) - see `server/deploy/nginx-location.conf`.

`.env` (server/.env.example has every key): `SAP_HOST`, optional `SAP_CLIENT` (default shown in the sign-in form),
`SAP_ALLOWED_SIDS=EDS`, `SAP_ALLOWED_PACKAGES=ZEMAMI`, `HUB_AUTH_JWT_SECRET` (the matching hub's), `SESSION_SECRET`,
`HUB_ACCESS_API_BASE`, `ALLOWED_ORIGINS`. Leave `SAP_USER`, `SAP_PASSWORD` and `ANTHROPIC_API_KEY` empty (CLI only).

## UI

`npm run dev` (http://localhost:3220/apps/sap-agent/) talks to http://localhost:4130 - e.g. an SSH tunnel to the box,
or a local server started with `ALLOW_DEV_LOGIN=true` (never on a server). Override with `NEXT_PUBLIC_SAP_AGENT_API`.

## Before the first real run

1. SAP EDS: the bootstrap (installs the handler classes in ZEMAMI) and the SICF node `/sap/zsrc_agent/tasks` (currently
   404 on EDS), STVARV `ZSRC_AGENT_SIDS` = EDS and `ZSRC_AGENT_PACKAGES` = ZEMAMI (server/README.md). The people using the
   agent need developer authorisations for ZEMAMI (S_DEVELOP, S_ADT_RES, transports) - or role Z_SRC_AGENT.
2. Manage Access: give the Admin role on **SAP Agent** to the people who may use it.
