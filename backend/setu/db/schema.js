'use strict';
const { pool } = require('../../db');
const { AGENT_STATUSES, BELL_EVENTS, CALL_OUTCOMES, CONVERSATION_KINDS, ROLES, SEVERITIES, TRIGGERS, sqlList } = require('../constants');
const { seed } = require('./seed');

// Creates the setu schema and every table / index, then inserts any missing base configuration (seed.js).
// Everything is CREATE ... IF NOT EXISTS / insert-if-missing, so it is safe to run again. To keep backend cold
// starts fast it runs only when the stored schema version differs from SCHEMA_VERSION: bump it whenever this
// file or seed.js changes.
const SCHEMA_VERSION = 4;

async function initSchema() {
    try {
        const { rows } = await pool.query(`SELECT value FROM setu.settings WHERE key = 'schema.version'`);
        if (Number(rows[0]?.value) === SCHEMA_VERSION) return;
    } catch {
        // First start: the schema is not there yet.
    }
    await pool.query('CREATE SCHEMA IF NOT EXISTS setu');
    await pool.query('CREATE SEQUENCE IF NOT EXISTS setu.ticket_id_seq START 100000 MINVALUE 1');

    // People
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.agents (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL,
            email text NOT NULL UNIQUE,
            role text NOT NULL DEFAULT 'Agent' CHECK (role IN (${sqlList(ROLES)})),
            active boolean NOT NULL DEFAULT true,
            availability text NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN (${sqlList(Object.keys(AGENT_STATUSES))})),
            "lastSeenAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.groups (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL UNIQUE,
            description text,
            assignment text NOT NULL DEFAULT 'MANUAL' CHECK (assignment IN ('MANUAL', 'ROUND_ROBIN')),
            "lastAssignedAgentId" integer
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.group_members (
            "agentId" integer NOT NULL REFERENCES setu.agents(id) ON DELETE CASCADE,
            "groupId" integer NOT NULL REFERENCES setu.groups(id) ON DELETE CASCADE,
            PRIMARY KEY ("agentId", "groupId")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.companies (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL UNIQUE,
            description text,
            domains text[] NOT NULL DEFAULT '{}'
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.contacts (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL,
            email text UNIQUE,
            phone text,
            mobile text,
            "anonymizedAt" timestamptz,
            "companyId" integer REFERENCES setu.companies(id),
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);

    // Configuration (master data)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.ticket_statuses (
            id integer PRIMARY KEY,
            name text NOT NULL UNIQUE,
            "pausesSla" boolean NOT NULL DEFAULT true,
            "isResolved" boolean NOT NULL DEFAULT false,
            "isClosed" boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.field_definitions (
            id serial PRIMARY KEY,
            key text NOT NULL UNIQUE,
            label text NOT NULL,
            type text NOT NULL CHECK (type IN ('text', 'number', 'dropdown', 'nested', 'paragraph')),
            required boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.field_choices (
            id serial PRIMARY KEY,
            "fieldId" integer NOT NULL REFERENCES setu.field_definitions(id) ON DELETE CASCADE,
            "parentId" integer REFERENCES setu.field_choices(id) ON DELETE CASCADE,
            value text NOT NULL,
            position integer NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS field_choices_field_parent_idx ON setu.field_choices ("fieldId", "parentId")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.severity_rules (
            id serial PRIMARY KEY,
            category text NOT NULL,
            "function" text NOT NULL DEFAULT '*',
            severity text NOT NULL CHECK (severity IN (${sqlList(SEVERITIES)})),
            UNIQUE (category, "function")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.business_hours (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            timezone text NOT NULL DEFAULT 'Asia/Kolkata',
            days jsonb NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.holidays (
            id serial PRIMARY KEY,
            "businessHoursId" integer NOT NULL REFERENCES setu.business_hours(id) ON DELETE CASCADE,
            date date NOT NULL,
            name text NOT NULL,
            UNIQUE ("businessHoursId", date)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.sla_policies (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            "isDefault" boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.sla_policy_groups (
            "policyId" integer NOT NULL REFERENCES setu.sla_policies(id) ON DELETE CASCADE,
            "groupId" integer NOT NULL REFERENCES setu.groups(id) ON DELETE CASCADE,
            PRIMARY KEY ("policyId", "groupId")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.sla_targets (
            id serial PRIMARY KEY,
            "policyId" integer NOT NULL REFERENCES setu.sla_policies(id) ON DELETE CASCADE,
            priority integer NOT NULL CHECK (priority BETWEEN 1 AND 4),
            "firstResponseMins" integer NOT NULL,
            "nextResponseMins" integer,
            "resolutionMins" integer NOT NULL,
            "businessHours" boolean NOT NULL DEFAULT true,
            escalate boolean NOT NULL DEFAULT true,
            UNIQUE ("policyId", priority)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.automation_rules (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            trigger text NOT NULL CHECK (trigger IN (${sqlList(TRIGGERS)})),
            active boolean NOT NULL DEFAULT true,
            position integer NOT NULL DEFAULT 0,
            conditions jsonb NOT NULL,
            actions jsonb NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.email_templates (
            key text PRIMARY KEY,
            audience text NOT NULL CHECK (audience IN ('requester', 'agent')),
            enabled boolean NOT NULL DEFAULT true,
            subject text NOT NULL,
            body text NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.scenarios (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            actions jsonb NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.canned_responses (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            folder text NOT NULL DEFAULT 'General',
            title text NOT NULL,
            "shortCode" text UNIQUE,
            body text NOT NULL,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.distributors (
            id serial PRIMARY KEY,
            code text NOT NULL UNIQUE,
            name text NOT NULL,
            region text,
            state text,
            depot text,
            "asmName" text,
            "depotCoordinator" text,
            category text,
            active boolean NOT NULL DEFAULT true,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.mr_mappings (
            "mrUid" text PRIMARY KEY,
            "mrName" text,
            "distributorCode" text NOT NULL,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.audit_events (
            id serial PRIMARY KEY,
            "actorEmail" text,
            action text NOT NULL,
            details jsonb NOT NULL DEFAULT '{}',
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS audit_events_created_idx ON setu.audit_events ("createdAt")');
    await pool.query('CREATE TABLE IF NOT EXISTS setu.settings (key text PRIMARY KEY, value jsonb NOT NULL)');
    // Saved insights (AI analysis of a ticket, the dashboard summary) so the same question is not asked twice.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.ai_insights (
            key text PRIMARY KEY,
            payload jsonb NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);

    // Tickets
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.tickets (
            id integer PRIMARY KEY DEFAULT nextval('setu.ticket_id_seq'),
            "externalId" bigint UNIQUE,
            subject text NOT NULL,
            description text NOT NULL DEFAULT '',
            "requesterId" integer NOT NULL REFERENCES setu.contacts(id),
            "companyId" integer REFERENCES setu.companies(id),
            "statusId" integer NOT NULL DEFAULT 2 REFERENCES setu.ticket_statuses(id),
            priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 4),
            severity text NOT NULL DEFAULT 'NORMAL' CHECK (severity IN (${sqlList(SEVERITIES)})),
            source text NOT NULL DEFAULT 'Email',
            type text,
            "groupId" integer REFERENCES setu.groups(id),
            "agentId" integer REFERENCES setu.agents(id),
            tags text[] NOT NULL DEFAULT '{}',
            "callSubject" text,
            region text,
            "distributorCode" text,
            "distributorName" text,
            "salesOrg" text,
            state text,
            depot text,
            "asmName" text,
            "depotCoordinator" text,
            "mrUid" text,
            "mobileNo" text,
            "alternateMobileNo" text,
            "callerName" text,
            "callerContactNumber" text,
            category text,
            "function" text,
            "l2Agent" text,
            "helpdeskAnalysis" text,
            "rcaSolution" text,
            "firstResponseDueAt" timestamptz,
            "nextResponseDueAt" timestamptz,
            "resolutionDueAt" timestamptz,
            "firstRespondedAt" timestamptz,
            "resolvedAt" timestamptz,
            "closedAt" timestamptz,
            "statusChangedAt" timestamptz NOT NULL DEFAULT now(),
            "slaPausedAt" timestamptz,
            "slaPausedMins" integer NOT NULL DEFAULT 0,
            "frReminded" boolean NOT NULL DEFAULT false,
            "resReminded" boolean NOT NULL DEFAULT false,
            "frViolated" boolean NOT NULL DEFAULT false,
            "resViolated" boolean NOT NULL DEFAULT false,
            "escalatedAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('ALTER SEQUENCE setu.ticket_id_seq OWNED BY setu.tickets.id');
    for (const [name, cols] of [
        ['tickets_status_idx', '"statusId"'],
        ['tickets_agent_idx', '"agentId"'],
        ['tickets_group_idx', '"groupId"'],
        ['tickets_created_idx', '"createdAt"'],
        ['tickets_category_function_idx', 'category, "function"'],
        ['tickets_requester_idx', '"requesterId"'],
        ['tickets_agent_status_idx', '"agentId", "statusId"'],
        ['tickets_updated_idx', '"updatedAt"'],
        ['tickets_distributor_idx', '"distributorCode"'],
    ]) {
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON setu.tickets (${cols})`);
    }
    // Open tickets by due time (SLA checks, "due in" filters, overdue counts) and tag filters.
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_open_resolution_due_idx ON setu.tickets ("resolutionDueAt") WHERE "resolvedAt" IS NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_open_first_response_due_idx ON setu.tickets ("firstResponseDueAt") WHERE "firstRespondedAt" IS NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_tags_idx ON setu.tickets USING gin (tags)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.conversations (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            kind text NOT NULL CHECK (kind IN (${sqlList(CONVERSATION_KINDS)})),
            "bodyHtml" text NOT NULL,
            "bodyText" text NOT NULL,
            "fromEmail" text,
            "toEmails" text[] NOT NULL DEFAULT '{}',
            "ccEmails" text[] NOT NULL DEFAULT '{}',
            "agentId" integer REFERENCES setu.agents(id),
            "messageId" text UNIQUE,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_ticket_idx ON setu.conversations ("ticketId", "createdAt")');
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_from_idx ON setu.conversations ("fromEmail")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.attachments (
            id serial PRIMARY KEY,
            "conversationId" integer NOT NULL REFERENCES setu.conversations(id) ON DELETE CASCADE,
            "fileName" text NOT NULL,
            "contentType" text NOT NULL,
            size integer NOT NULL,
            "storageKey" text NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.activities (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            "actorAgentId" integer REFERENCES setu.agents(id),
            action text NOT NULL,
            details jsonb NOT NULL DEFAULT '{}',
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS activities_ticket_idx ON setu.activities ("ticketId", "createdAt")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.time_logs (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES setu.agents(id),
            minutes integer NOT NULL CHECK (minutes > 0),
            note text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.csat_responses (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK (rating BETWEEN 1 AND 3),
            comment text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    // Mail ingest bookkeeping (Microsoft 365 delta link) and parked noise
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.mail_state (
            mailbox text PRIMARY KEY,
            "deltaLink" text,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.parked_mail (
            id serial PRIMARY KEY,
            "messageId" text NOT NULL UNIQUE,
            "fromEmail" text NOT NULL,
            subject text NOT NULL,
            reason text NOT NULL,
            "receivedAt" timestamptz NOT NULL
        )
    `);

    await upgradeV3();
    await upgradeV4();
    await seed();
    await pool.query(
        `INSERT INTO setu.settings (key, value) VALUES ('schema.version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(SCHEMA_VERSION)],
    );
}

// v3: last activity on tickets, personal canned responses, call logs, the in-app bell, WhatsApp / portal channels.
async function upgradeV3() {
    // Last activity (status change, reply, note, call ...) shown in the ticket list.
    await pool.query(`
        ALTER TABLE setu.tickets
            ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamptz,
            ADD COLUMN IF NOT EXISTS "lastActivityKind" text,
            ADD COLUMN IF NOT EXISTS "lastActivityBy" text,
            ADD COLUMN IF NOT EXISTS "lastActivityDetail" text
    `);
    await pool.query(`UPDATE setu.tickets SET "lastActivityAt" = "updatedAt", "lastActivityKind" = 'created' WHERE "lastActivityAt" IS NULL`);
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_last_activity_idx ON setu.tickets ("lastActivityAt")');

    // Canned responses: ownerAgentId NULL = shared (Admin), otherwise private to that agent. Short codes are unique
    // per owner, so two agents can both have /thanks.
    await pool.query('ALTER TABLE setu.canned_responses ADD COLUMN IF NOT EXISTS "ownerAgentId" integer REFERENCES setu.agents(id) ON DELETE CASCADE');
    await pool.query('ALTER TABLE setu.canned_responses DROP CONSTRAINT IF EXISTS "canned_responses_shortCode_key"');
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS canned_owner_code_idx ON setu.canned_responses (COALESCE("ownerAgentId", 0), lower("shortCode")) WHERE "shortCode" IS NOT NULL`);

    // Messages from WhatsApp carry the sender's number instead of an email address.
    await pool.query(`
        ALTER TABLE setu.conversations
            ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'portal')),
            ADD COLUMN IF NOT EXISTS "fromPhone" text
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS contacts_mobile_idx ON setu.contacts (mobile)');

    // Agent preferences (bell events they muted).
    await pool.query(`ALTER TABLE setu.agents ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.call_logs (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES setu.agents(id),
            phone text NOT NULL,
            direction text NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND', 'INBOUND')),
            outcome text NOT NULL CHECK (outcome IN (${sqlList(CALL_OUTCOMES)})),
            "durationSecs" integer NOT NULL DEFAULT 0 CHECK ("durationSecs" BETWEEN 0 AND 86400),
            notes text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS call_logs_ticket_idx ON setu.call_logs ("ticketId", "createdAt")');

    // In-app bell (Setu header). Separate from the hub inbox / Outlook notifications.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS setu.notifications (
            id serial PRIMARY KEY,
            "agentId" integer NOT NULL REFERENCES setu.agents(id) ON DELETE CASCADE,
            "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
            event text NOT NULL CHECK (event IN (${sqlList(BELL_EVENTS)})),
            title text NOT NULL,
            body text NOT NULL DEFAULT '',
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "readAt" timestamptz
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS notifications_agent_idx ON setu.notifications ("agentId", "createdAt" DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS notifications_unread_idx ON setu.notifications ("agentId") WHERE "readAt" IS NULL');
}

// v4: the app is shown as Samadhan - the default email sign-off in templates already stored follows the new name.
async function upgradeV4() {
    await pool.query(
        `UPDATE setu.email_templates SET body = replace(body, 'Regards,<br>Setu – Emami Secondary Helpdesk', 'Regards,<br>Samadhan – Emami Secondary Helpdesk')
          WHERE body LIKE '%Regards,<br>Setu – Emami Secondary Helpdesk%'`,
    );
}

module.exports = { SCHEMA_VERSION, initSchema };
