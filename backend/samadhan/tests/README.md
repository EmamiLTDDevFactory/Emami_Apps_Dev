# Samadhan tests (formerly Setu)

## Unit tests (no database, no network)

```bash
node --test backend/samadhan/tests/unit.test.js
```

Subject parsing, noise filter, sender verification, business-hours arithmetic, automation conditions.

## API test suite (end to end)

`api.test.js` drives a running backend over HTTP and checks access control, ticket rules (numbering, severity,
round robin, SLA pause / resume, required fields), automations, reports, admin screens and the security measures
(token checks, concurrent-edit protection, formula neutralising, input limits, contact removal, rate limits).

It writes data, so it only runs against a **throwaway local database**: it refuses unless `SAMADHAN_TEST_ALLOW=1` and
both URLs point at localhost. Never point it at the shared dev or production database.

1. A local Postgres with an empty database, plus the two hub tables the backend expects:
   ```sql
   CREATE SCHEMA emami_apps;
   CREATE TABLE emami_apps.authorized_user_apps (email text NOT NULL, app_id text NOT NULL, role text, depot text, PRIMARY KEY (email, app_id));
   CREATE TABLE emami_apps.users (user_id serial PRIMARY KEY, email text, name text);
   ```
2. Start the backend against it (it creates the `samadhan` schema on start):
   ```bash
   cd backend
   PGHOST=localhost PGPORT=55432 PGDATABASE=samadhan_test PGUSER=postgres PGPASSWORD=x PORT=4191 HUB_INTERNAL_API_SECRET=localtest node server.js
   ```
3. Run the suite (same `HUB_AUTH_JWT_SECRET` as the backend, read from `backend/.env`):
   ```bash
   SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_API=http://localhost:4191/api/samadhan SAMADHAN_TEST_PG=postgres://postgres@localhost:55432/samadhan_test node backend/samadhan/tests/api.test.js
   ```

The counts it checks assume a database with no tickets yet, so use a fresh database for each run.

## AI mode, without a key or cost

`mock-anthropic.js` stands in for the Anthropic API: it checks each request Samadhan sends (model, refusal fallback,
JSON schema, prompt caching, no email addresses or phone numbers) and answers in the requested schema. Modes:
`ok`, `refusal` (the AI declines) and `error` (the service fails) - the last two must fall back to built-in insights.

```bash
node backend/samadhan/tests/mock-anthropic.js 4199 ok
# backend: add  ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://localhost:4199  to the start command above
SAMADHAN_TEST_ALLOW=1 SAMADHAN_TEST_AI=1 node backend/samadhan/tests/api.test.js
curl http://localhost:4199/_requests   # every request received, with any problems found
```

The old `SETU_TEST_*` names still work. `SAMADHAN_TEST_APP_ID` (default `samadhan`) and `SAMADHAN_TEST_SCHEMA`
(default `samadhan`) let the same suite prove the pre-rename compatibility layer: run it once more against
`/api/setu` with app id `setu`. On this Windows machine port 4190 cannot be used — the examples use 4191.

## Golden files (byte-identical outputs)

`golden/golden.js capture|compare` loads `golden/fixture.sql` and compares the daily report and the default export
with `golden/daily-report.json` and `golden/export-default.json`, captured from the v6 code (commit 9090e09).
They must stay byte-identical in every later phase. Local databases only.
