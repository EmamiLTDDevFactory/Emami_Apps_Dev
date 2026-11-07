'use strict';
const { activeSchema, pool, resolveSchema } = require('./pool');
const { AGENT_STATUSES, BELL_EVENTS, CALL_OUTCOMES, CONVERSATION_KINDS, ROLES, SEVERITIES, TRIGGERS, sqlList } = require('../constants');
const { seed } = require('./seed');

// Creates the Samadhan schema (the name comes from db/pool.js) and every table / index, then inserts any missing base configuration (seed.js).
// Everything is CREATE ... IF NOT EXISTS / insert-if-missing, so it is safe to run again. To keep backend cold
// starts fast it runs only when the stored schema version differs from SCHEMA_VERSION: bump it whenever this
// file or seed.js changes.
// 7: v7 migrations (db/migrate.js).
// 8: v7.1 Authorization cockpit tables (migration 7.1-auth, applied by migrate.startup()).
// 9: v7.1 attachments (migration 7.1-attachments).
// 10: v7.2 workspaces and applications (migration 7.2-workspaces, applied by migrate.startup()).
// 11: v7.3 one app id and a generic catalogue (migration 7.3-generic). Since 11 the migrations also run when the
//     version is unchanged (a forgotten bump can no longer skip one).
const SCHEMA_VERSION = 11;

async function initSchema() {
    await resolveSchema();
    try {
        const { rows } = await pool.query(`SELECT value FROM samadhan.settings WHERE key = 'schema.version'`);
        if (Number(rows[0]?.value) === SCHEMA_VERSION) {
            // Tables are current; pending v7 migrations still run (one small query when there is nothing to do).
            await require('./migrate').startup();
            return;
        }
    } catch {
        // First start: the schema is not there yet.
    }
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${activeSchema()}"`);
    await pool.query('CREATE SEQUENCE IF NOT EXISTS samadhan.ticket_id_seq START 100000 MINVALUE 1');

    // People
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.agents (
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
        CREATE TABLE IF NOT EXISTS samadhan.groups (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL UNIQUE,
            description text,
            assignment text NOT NULL DEFAULT 'MANUAL' CHECK (assignment IN ('MANUAL', 'ROUND_ROBIN')),
            "lastAssignedAgentId" integer
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.group_members (
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            "groupId" integer NOT NULL REFERENCES samadhan.groups(id) ON DELETE CASCADE,
            PRIMARY KEY ("agentId", "groupId")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.companies (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL UNIQUE,
            description text,
            domains text[] NOT NULL DEFAULT '{}'
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.contacts (
            id serial PRIMARY KEY,
            "externalId" bigint UNIQUE,
            name text NOT NULL,
            email text UNIQUE,
            phone text,
            mobile text,
            "anonymizedAt" timestamptz,
            "companyId" integer REFERENCES samadhan.companies(id),
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);

    // Configuration (master data)
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.ticket_statuses (
            id integer PRIMARY KEY,
            name text NOT NULL UNIQUE,
            "pausesSla" boolean NOT NULL DEFAULT true,
            "isResolved" boolean NOT NULL DEFAULT false,
            "isClosed" boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.field_definitions (
            id serial PRIMARY KEY,
            key text NOT NULL UNIQUE,
            label text NOT NULL,
            type text NOT NULL CHECK (type IN ('text', 'number', 'dropdown', 'nested', 'paragraph')),
            required boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.field_choices (
            id serial PRIMARY KEY,
            "fieldId" integer NOT NULL REFERENCES samadhan.field_definitions(id) ON DELETE CASCADE,
            "parentId" integer REFERENCES samadhan.field_choices(id) ON DELETE CASCADE,
            value text NOT NULL,
            position integer NOT NULL DEFAULT 0,
            active boolean NOT NULL DEFAULT true
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS field_choices_field_parent_idx ON samadhan.field_choices ("fieldId", "parentId")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.severity_rules (
            id serial PRIMARY KEY,
            category text NOT NULL,
            "function" text NOT NULL DEFAULT '*',
            severity text NOT NULL CHECK (severity IN (${sqlList(SEVERITIES)})),
            UNIQUE (category, "function")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.business_hours (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            timezone text NOT NULL DEFAULT 'Asia/Kolkata',
            days jsonb NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.holidays (
            id serial PRIMARY KEY,
            "businessHoursId" integer NOT NULL REFERENCES samadhan.business_hours(id) ON DELETE CASCADE,
            date date NOT NULL,
            name text NOT NULL,
            UNIQUE ("businessHoursId", date)
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.sla_policies (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            "isDefault" boolean NOT NULL DEFAULT false,
            position integer NOT NULL DEFAULT 0
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.sla_policy_groups (
            "policyId" integer NOT NULL REFERENCES samadhan.sla_policies(id) ON DELETE CASCADE,
            "groupId" integer NOT NULL REFERENCES samadhan.groups(id) ON DELETE CASCADE,
            PRIMARY KEY ("policyId", "groupId")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.sla_targets (
            id serial PRIMARY KEY,
            "policyId" integer NOT NULL REFERENCES samadhan.sla_policies(id) ON DELETE CASCADE,
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
        CREATE TABLE IF NOT EXISTS samadhan.automation_rules (
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
        CREATE TABLE IF NOT EXISTS samadhan.email_templates (
            key text PRIMARY KEY,
            audience text NOT NULL CHECK (audience IN ('requester', 'agent')),
            enabled boolean NOT NULL DEFAULT true,
            subject text NOT NULL,
            body text NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.scenarios (
            id serial PRIMARY KEY,
            name text NOT NULL UNIQUE,
            actions jsonb NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.canned_responses (
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
        CREATE TABLE IF NOT EXISTS samadhan.distributors (
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
        CREATE TABLE IF NOT EXISTS samadhan.mr_mappings (
            "mrUid" text PRIMARY KEY,
            "mrName" text,
            "distributorCode" text NOT NULL,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.audit_events (
            id serial PRIMARY KEY,
            "actorEmail" text,
            action text NOT NULL,
            details jsonb NOT NULL DEFAULT '{}',
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS audit_events_created_idx ON samadhan.audit_events ("createdAt")');
    await pool.query('CREATE TABLE IF NOT EXISTS samadhan.settings (key text PRIMARY KEY, value jsonb NOT NULL)');
    // Saved insights (AI analysis of a ticket, the dashboard summary) so the same question is not asked twice.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.ai_insights (
            key text PRIMARY KEY,
            payload jsonb NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);

    // Tickets
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.tickets (
            id integer PRIMARY KEY DEFAULT nextval('samadhan.ticket_id_seq'),
            "externalId" bigint UNIQUE,
            subject text NOT NULL,
            description text NOT NULL DEFAULT '',
            "requesterId" integer NOT NULL REFERENCES samadhan.contacts(id),
            "companyId" integer REFERENCES samadhan.companies(id),
            "statusId" integer NOT NULL DEFAULT 2 REFERENCES samadhan.ticket_statuses(id),
            priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 4),
            severity text NOT NULL DEFAULT 'NORMAL' CHECK (severity IN (${sqlList(SEVERITIES)})),
            source text NOT NULL DEFAULT 'Email',
            type text,
            "groupId" integer REFERENCES samadhan.groups(id),
            "agentId" integer REFERENCES samadhan.agents(id),
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
    await pool.query('ALTER SEQUENCE samadhan.ticket_id_seq OWNED BY samadhan.tickets.id');
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
        await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON samadhan.tickets (${cols})`);
    }
    // Open tickets by due time (SLA checks, "due in" filters, overdue counts) and tag filters.
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_open_resolution_due_idx ON samadhan.tickets ("resolutionDueAt") WHERE "resolvedAt" IS NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_open_first_response_due_idx ON samadhan.tickets ("firstResponseDueAt") WHERE "firstRespondedAt" IS NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_tags_idx ON samadhan.tickets USING gin (tags)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.conversations (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            kind text NOT NULL CHECK (kind IN (${sqlList(CONVERSATION_KINDS)})),
            "bodyHtml" text NOT NULL,
            "bodyText" text NOT NULL,
            "fromEmail" text,
            "toEmails" text[] NOT NULL DEFAULT '{}',
            "ccEmails" text[] NOT NULL DEFAULT '{}',
            "agentId" integer REFERENCES samadhan.agents(id),
            "messageId" text UNIQUE,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_ticket_idx ON samadhan.conversations ("ticketId", "createdAt")');
    await pool.query('CREATE INDEX IF NOT EXISTS conversations_from_idx ON samadhan.conversations ("fromEmail")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.attachments (
            id serial PRIMARY KEY,
            "conversationId" integer NOT NULL REFERENCES samadhan.conversations(id) ON DELETE CASCADE,
            "fileName" text NOT NULL,
            "contentType" text NOT NULL,
            size integer NOT NULL,
            "storageKey" text NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.activities (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "actorAgentId" integer REFERENCES samadhan.agents(id),
            action text NOT NULL,
            details jsonb NOT NULL DEFAULT '{}',
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS activities_ticket_idx ON samadhan.activities ("ticketId", "createdAt")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.time_logs (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id),
            minutes integer NOT NULL CHECK (minutes > 0),
            note text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.csat_responses (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            rating integer NOT NULL CHECK (rating BETWEEN 1 AND 3),
            comment text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    // Mail ingest bookkeeping (Microsoft 365 delta link) and parked noise
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.mail_state (
            mailbox text PRIMARY KEY,
            "deltaLink" text,
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.parked_mail (
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
    await upgradeV5();
    await upgradeV6();
    await require('./migrate').startup();
    await seed();
    await pool.query(
        `INSERT INTO samadhan.settings (key, value) VALUES ('schema.version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [JSON.stringify(SCHEMA_VERSION)],
    );
}

// v3: last activity on tickets, personal canned responses, call logs, the in-app bell, WhatsApp / portal channels.
async function upgradeV3() {
    // Last activity (status change, reply, note, call ...) shown in the ticket list.
    await pool.query(`
        ALTER TABLE samadhan.tickets
            ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamptz,
            ADD COLUMN IF NOT EXISTS "lastActivityKind" text,
            ADD COLUMN IF NOT EXISTS "lastActivityBy" text,
            ADD COLUMN IF NOT EXISTS "lastActivityDetail" text
    `);
    await pool.query(`UPDATE samadhan.tickets SET "lastActivityAt" = "updatedAt", "lastActivityKind" = 'created' WHERE "lastActivityAt" IS NULL`);
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_last_activity_idx ON samadhan.tickets ("lastActivityAt")');

    // Canned responses: ownerAgentId NULL = shared (Admin), otherwise private to that agent. Short codes are unique
    // per owner, so two agents can both have /thanks.
    await pool.query('ALTER TABLE samadhan.canned_responses ADD COLUMN IF NOT EXISTS "ownerAgentId" integer REFERENCES samadhan.agents(id) ON DELETE CASCADE');
    await pool.query('ALTER TABLE samadhan.canned_responses DROP CONSTRAINT IF EXISTS "canned_responses_shortCode_key"');
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS canned_owner_code_idx ON samadhan.canned_responses (COALESCE("ownerAgentId", 0), lower("shortCode")) WHERE "shortCode" IS NOT NULL`);

    // Messages from WhatsApp carry the sender's number instead of an email address.
    await pool.query(`
        ALTER TABLE samadhan.conversations
            ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'portal')),
            ADD COLUMN IF NOT EXISTS "fromPhone" text
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS contacts_mobile_idx ON samadhan.contacts (mobile)');

    // Agent preferences (bell events they muted).
    await pool.query(`ALTER TABLE samadhan.agents ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.call_logs (
            id serial PRIMARY KEY,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id),
            phone text NOT NULL,
            direction text NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND', 'INBOUND')),
            outcome text NOT NULL CHECK (outcome IN (${sqlList(CALL_OUTCOMES)})),
            "durationSecs" integer NOT NULL DEFAULT 0 CHECK ("durationSecs" BETWEEN 0 AND 86400),
            notes text,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS call_logs_ticket_idx ON samadhan.call_logs ("ticketId", "createdAt")');

    // In-app bell (Samadhan header). Separate from the hub inbox / Outlook notifications.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.notifications (
            id serial PRIMARY KEY,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            event text NOT NULL CHECK (event IN (${sqlList(BELL_EVENTS)})),
            title text NOT NULL,
            body text NOT NULL DEFAULT '',
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "readAt" timestamptz
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS notifications_agent_idx ON samadhan.notifications ("agentId", "createdAt" DESC)');
    await pool.query('CREATE INDEX IF NOT EXISTS notifications_unread_idx ON samadhan.notifications ("agentId") WHERE "readAt" IS NULL');
}

// v4: kept as a step of the version history; nothing left to do.
async function upgradeV4() {}

// v5: Freshdesk parity - watchers, linked / parent-child / merged tickets, spam and trash, to-dos, saved views,
// scenarios, collision detection, CSAT survey links and the Solutions knowledge base.
async function upgradeV5() {
    await pool.query(`
        ALTER TABLE samadhan.tickets
            ADD COLUMN IF NOT EXISTS "parentId" integer REFERENCES samadhan.tickets(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS "mergedIntoId" integer REFERENCES samadhan.tickets(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS spam boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_parent_idx ON samadhan.tickets ("parentId") WHERE "parentId" IS NOT NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS tickets_hidden_idx ON samadhan.tickets ("deletedAt", spam) WHERE spam OR "deletedAt" IS NOT NULL');
    for (const col of ['region', 'state', 'depot']) {
        await pool.query(`CREATE INDEX IF NOT EXISTS tickets_${col}_idx ON samadhan.tickets (${col})`);
    }
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.ticket_watchers (
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY ("ticketId", "agentId")
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS ticket_watchers_agent_idx ON samadhan.ticket_watchers ("agentId")');
    // A link is stored both ways, so either ticket finds the other with one indexed lookup.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.ticket_links (
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "linkedId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY ("ticketId", "linkedId"),
            CHECK ("ticketId" <> "linkedId")
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.todos (
            id serial PRIMARY KEY,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            "ticketId" integer REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            text text NOT NULL,
            done boolean NOT NULL DEFAULT false,
            "dueAt" timestamptz,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS todos_agent_idx ON samadhan.todos ("agentId", done)');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.saved_views (
            id serial PRIMARY KEY,
            "ownerAgentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            name text NOT NULL,
            shared boolean NOT NULL DEFAULT false,
            query jsonb NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    // Who has a ticket open right now ("X is replying"). Rows older than a minute are ignored and cleared lazily.
    await pool.query(`
        CREATE UNLOGGED TABLE IF NOT EXISTS samadhan.ticket_presence (
            "ticketId" integer NOT NULL REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            "agentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            mode text NOT NULL CHECK (mode IN ('viewing', 'replying')),
            at timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY ("ticketId", "agentId")
        )
    `);
    await pool.query(`
        ALTER TABLE samadhan.scenarios
            ADD COLUMN IF NOT EXISTS description text,
            ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0
    `);
    // CSAT: one survey link per closed ticket; the answer keeps the agent it was about.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.csat_requests (
            "ticketId" integer PRIMARY KEY REFERENCES samadhan.tickets(id) ON DELETE CASCADE,
            token text NOT NULL UNIQUE,
            "sentAt" timestamptz NOT NULL DEFAULT now(),
            "answeredAt" timestamptz
        )
    `);
    await pool.query('ALTER TABLE samadhan.csat_responses ADD COLUMN IF NOT EXISTS "agentId" integer REFERENCES samadhan.agents(id) ON DELETE SET NULL');
    await pool.query('CREATE INDEX IF NOT EXISTS csat_responses_ticket_idx ON samadhan.csat_responses ("ticketId")');
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.articles (
            id serial PRIMARY KEY,
            category text NOT NULL DEFAULT 'General',
            folder text NOT NULL DEFAULT 'General',
            title text NOT NULL UNIQUE,
            body text NOT NULL,
            status text NOT NULL DEFAULT 'draft' CHECK (status IN ('published', 'draft')),
            tags text[] NOT NULL DEFAULT '{}',
            views integer NOT NULL DEFAULT 0,
            helpful integer NOT NULL DEFAULT 0,
            "notHelpful" integer NOT NULL DEFAULT 0,
            "authorAgentId" integer REFERENCES samadhan.agents(id) ON DELETE SET NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('ALTER TABLE samadhan.companies ADD COLUMN IF NOT EXISTS "createdAt" timestamptz NOT NULL DEFAULT now()');
}

// v6: more bell events (mention, status change, escalation, SLA, CSAT, watching) and saved variants (report layouts).
async function upgradeV6() {
    await pool.query('ALTER TABLE samadhan.notifications DROP CONSTRAINT IF EXISTS notifications_event_check');
    await pool.query(`ALTER TABLE samadhan.notifications ADD CONSTRAINT notifications_event_check CHECK (event IN (${sqlList(BELL_EVENTS)}))`);
    // A named set of options for one screen (kind = 'report' for the daily report): private, or shared with everyone.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS samadhan.variants (
            id serial PRIMARY KEY,
            kind text NOT NULL,
            "ownerAgentId" integer NOT NULL REFERENCES samadhan.agents(id) ON DELETE CASCADE,
            name text NOT NULL,
            shared boolean NOT NULL DEFAULT false,
            config jsonb NOT NULL,
            "createdAt" timestamptz NOT NULL DEFAULT now(),
            "updatedAt" timestamptz NOT NULL DEFAULT now()
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS variants_kind_owner_idx ON samadhan.variants (kind, "ownerAgentId")');
}

module.exports = { SCHEMA_VERSION, initSchema };
