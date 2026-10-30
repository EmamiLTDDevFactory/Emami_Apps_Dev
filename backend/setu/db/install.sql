-- Setu helpdesk: schema, tables, indexes and base configuration.
-- Generated from backend/setu/db/schema.js and seed.js - the backend runs exactly this by itself on first start,
-- so this script is only needed when the backend cannot reach the database to do it (e.g. a DBA installs it).
-- Run once, on a database where the setu schema does not exist yet, as a user allowed to CREATE SCHEMA.
-- It refuses to run if the schema already exists. Afterwards the backend keeps the schema up to date itself.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'setu') THEN
    RAISE EXCEPTION 'The setu schema already exists - nothing to do (the backend maintains it).';
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS setu;

CREATE SEQUENCE IF NOT EXISTS setu.ticket_id_seq START 100000 MINVALUE 1;

CREATE TABLE IF NOT EXISTS setu.agents (
    id serial PRIMARY KEY,
    "externalId" bigint UNIQUE,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'Agent' CHECK (role IN ('Agent', 'Supervisor', 'Admin')),
    active boolean NOT NULL DEFAULT true,
    availability text NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE', 'UNAVAILABLE', 'MEETING', 'BREAK', 'TRAINING', 'LUNCH')),
    "lastSeenAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.groups (
    id serial PRIMARY KEY,
    "externalId" bigint UNIQUE,
    name text NOT NULL UNIQUE,
    description text,
    assignment text NOT NULL DEFAULT 'MANUAL' CHECK (assignment IN ('MANUAL', 'ROUND_ROBIN')),
    "lastAssignedAgentId" integer
);

CREATE TABLE IF NOT EXISTS setu.group_members (
    "agentId" integer NOT NULL REFERENCES setu.agents(id) ON DELETE CASCADE,
    "groupId" integer NOT NULL REFERENCES setu.groups(id) ON DELETE CASCADE,
    PRIMARY KEY ("agentId", "groupId")
);

CREATE TABLE IF NOT EXISTS setu.companies (
    id serial PRIMARY KEY,
    "externalId" bigint UNIQUE,
    name text NOT NULL UNIQUE,
    description text,
    domains text[] NOT NULL DEFAULT '{}'
);

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
);

CREATE TABLE IF NOT EXISTS setu.ticket_statuses (
    id integer PRIMARY KEY,
    name text NOT NULL UNIQUE,
    "pausesSla" boolean NOT NULL DEFAULT true,
    "isResolved" boolean NOT NULL DEFAULT false,
    "isClosed" boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS setu.field_definitions (
    id serial PRIMARY KEY,
    key text NOT NULL UNIQUE,
    label text NOT NULL,
    type text NOT NULL CHECK (type IN ('text', 'number', 'dropdown', 'nested', 'paragraph')),
    required boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS setu.field_choices (
    id serial PRIMARY KEY,
    "fieldId" integer NOT NULL REFERENCES setu.field_definitions(id) ON DELETE CASCADE,
    "parentId" integer REFERENCES setu.field_choices(id) ON DELETE CASCADE,
    value text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS field_choices_field_parent_idx ON setu.field_choices ("fieldId", "parentId");

CREATE TABLE IF NOT EXISTS setu.severity_rules (
    id serial PRIMARY KEY,
    category text NOT NULL,
    "function" text NOT NULL DEFAULT '*',
    severity text NOT NULL CHECK (severity IN ('FATAL', 'SERIOUS', 'NORMAL')),
    UNIQUE (category, "function")
);

CREATE TABLE IF NOT EXISTS setu.business_hours (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    timezone text NOT NULL DEFAULT 'Asia/Kolkata',
    days jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS setu.holidays (
    id serial PRIMARY KEY,
    "businessHoursId" integer NOT NULL REFERENCES setu.business_hours(id) ON DELETE CASCADE,
    date date NOT NULL,
    name text NOT NULL,
    UNIQUE ("businessHoursId", date)
);

CREATE TABLE IF NOT EXISTS setu.sla_policies (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    "isDefault" boolean NOT NULL DEFAULT false,
    position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS setu.sla_policy_groups (
    "policyId" integer NOT NULL REFERENCES setu.sla_policies(id) ON DELETE CASCADE,
    "groupId" integer NOT NULL REFERENCES setu.groups(id) ON DELETE CASCADE,
    PRIMARY KEY ("policyId", "groupId")
);

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
);

CREATE TABLE IF NOT EXISTS setu.automation_rules (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    trigger text NOT NULL CHECK (trigger IN ('ON_CREATE', 'ON_UPDATE', 'TIME')),
    active boolean NOT NULL DEFAULT true,
    position integer NOT NULL DEFAULT 0,
    conditions jsonb NOT NULL,
    actions jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS setu.email_templates (
    key text PRIMARY KEY,
    audience text NOT NULL CHECK (audience IN ('requester', 'agent')),
    enabled boolean NOT NULL DEFAULT true,
    subject text NOT NULL,
    body text NOT NULL
);

CREATE TABLE IF NOT EXISTS setu.scenarios (
    id serial PRIMARY KEY,
    name text NOT NULL UNIQUE,
    actions jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS setu.canned_responses (
    id serial PRIMARY KEY,
    "externalId" bigint UNIQUE,
    folder text NOT NULL DEFAULT 'General',
    title text NOT NULL,
    "shortCode" text UNIQUE,
    body text NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

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
);

CREATE TABLE IF NOT EXISTS setu.mr_mappings (
    "mrUid" text PRIMARY KEY,
    "mrName" text,
    "distributorCode" text NOT NULL,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.audit_events (
    id serial PRIMARY KEY,
    "actorEmail" text,
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx ON setu.audit_events ("createdAt");

CREATE TABLE IF NOT EXISTS setu.settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS setu.ai_insights (
    key text PRIMARY KEY,
    payload jsonb NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.tickets (
    id integer PRIMARY KEY DEFAULT nextval('setu.ticket_id_seq'),
    "externalId" bigint UNIQUE,
    subject text NOT NULL,
    description text NOT NULL DEFAULT '',
    "requesterId" integer NOT NULL REFERENCES setu.contacts(id),
    "companyId" integer REFERENCES setu.companies(id),
    "statusId" integer NOT NULL DEFAULT 2 REFERENCES setu.ticket_statuses(id),
    priority integer NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 4),
    severity text NOT NULL DEFAULT 'NORMAL' CHECK (severity IN ('FATAL', 'SERIOUS', 'NORMAL')),
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
);

ALTER SEQUENCE setu.ticket_id_seq OWNED BY setu.tickets.id;

CREATE INDEX IF NOT EXISTS tickets_status_idx ON setu.tickets ("statusId");

CREATE INDEX IF NOT EXISTS tickets_agent_idx ON setu.tickets ("agentId");

CREATE INDEX IF NOT EXISTS tickets_group_idx ON setu.tickets ("groupId");

CREATE INDEX IF NOT EXISTS tickets_created_idx ON setu.tickets ("createdAt");

CREATE INDEX IF NOT EXISTS tickets_category_function_idx ON setu.tickets (category, "function");

CREATE INDEX IF NOT EXISTS tickets_requester_idx ON setu.tickets ("requesterId");

CREATE INDEX IF NOT EXISTS tickets_agent_status_idx ON setu.tickets ("agentId", "statusId");

CREATE INDEX IF NOT EXISTS tickets_updated_idx ON setu.tickets ("updatedAt");

CREATE INDEX IF NOT EXISTS tickets_distributor_idx ON setu.tickets ("distributorCode");

CREATE INDEX IF NOT EXISTS tickets_open_resolution_due_idx ON setu.tickets ("resolutionDueAt") WHERE "resolvedAt" IS NULL;

CREATE INDEX IF NOT EXISTS tickets_open_first_response_due_idx ON setu.tickets ("firstResponseDueAt") WHERE "firstRespondedAt" IS NULL;

CREATE INDEX IF NOT EXISTS tickets_tags_idx ON setu.tickets USING gin (tags);

CREATE TABLE IF NOT EXISTS setu.conversations (
    id serial PRIMARY KEY,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('INCOMING', 'REPLY', 'NOTE', 'FORWARD')),
    "bodyHtml" text NOT NULL,
    "bodyText" text NOT NULL,
    "fromEmail" text,
    "toEmails" text[] NOT NULL DEFAULT '{}',
    "ccEmails" text[] NOT NULL DEFAULT '{}',
    "agentId" integer REFERENCES setu.agents(id),
    "messageId" text UNIQUE,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_ticket_idx ON setu.conversations ("ticketId", "createdAt");

CREATE INDEX IF NOT EXISTS conversations_from_idx ON setu.conversations ("fromEmail");

CREATE TABLE IF NOT EXISTS setu.attachments (
    id serial PRIMARY KEY,
    "conversationId" integer NOT NULL REFERENCES setu.conversations(id) ON DELETE CASCADE,
    "fileName" text NOT NULL,
    "contentType" text NOT NULL,
    size integer NOT NULL,
    "storageKey" text NOT NULL
);

CREATE TABLE IF NOT EXISTS setu.activities (
    id serial PRIMARY KEY,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    "actorAgentId" integer REFERENCES setu.agents(id),
    action text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activities_ticket_idx ON setu.activities ("ticketId", "createdAt");

CREATE TABLE IF NOT EXISTS setu.time_logs (
    id serial PRIMARY KEY,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    "agentId" integer NOT NULL REFERENCES setu.agents(id),
    minutes integer NOT NULL CHECK (minutes > 0),
    note text,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.csat_responses (
    id serial PRIMARY KEY,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 3),
    comment text,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.mail_state (
    mailbox text PRIMARY KEY,
    "deltaLink" text,
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS setu.parked_mail (
    id serial PRIMARY KEY,
    "messageId" text NOT NULL UNIQUE,
    "fromEmail" text NOT NULL,
    subject text NOT NULL,
    reason text NOT NULL,
    "receivedAt" timestamptz NOT NULL
);

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (2, 'Open', false, false, false, 0) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (3, 'Pending', true, false, false, 1) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (15, 'WIP-FUNC', true, false, false, 2) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (14, 'WIP-AUTH', true, false, false, 3) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (8, 'Escalation to L3 Support', true, false, false, 4) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (11, 'Pending Confirmation from function', true, false, false, 5) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (12, 'Confirmation / Information pending from User', true, false, false, 6) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (9, 'Resolved but confirmation pending from User', true, false, false, 7) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (13, 'New Requirement', true, false, false, 8) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (4, 'Resolved', true, true, false, 9) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position)
     VALUES (5, 'Closed', true, true, true, 10) ON CONFLICT (id) DO NOTHING;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('callSubject', 'Call Subject', 'text', false, 0)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('region', 'Region', 'dropdown', true, 1)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'EAST', 0);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'WEST', 1);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'NORTH', 2);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'SOUTH', 3);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'Wrong Ticket', 4);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (2, 'ALL REGIONS', 5);

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('distributorCode', 'Distributor Code', 'text', true, 2)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('distributorName', 'Distributor Name', 'text', true, 3)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('salesOrg', 'Sales Org', 'dropdown', true, 4)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (5, 'EM01 - CCD', 0);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (5, 'EM02 - HCD', 1);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (5, 'Wrong Ticket', 2);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (5, 'ALL', 3);

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('state', 'State', 'dropdown', true, 5)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('depot', 'Depot', 'dropdown', true, 6)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('asmName', 'ASM Name', 'dropdown', true, 7)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('depotCoordinator', 'Depot Co-ordinator', 'dropdown', true, 8)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('mrUid', 'MR UID', 'text', false, 9)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('mobileNo', 'Mobile No', 'text', false, 10)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('alternateMobileNo', 'Alternate Mobile No', 'text', false, 11)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('callerName', 'Caller Name', 'text', false, 12)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('callerContactNumber', 'Caller Contact Number', 'text', false, 13)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('type', 'Type', 'dropdown', true, 14)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'Rural mSFA', 0);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'Wrong ticket', 1);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'CDMS', 2);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'mSFA', 3);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'SalesCode DMS', 4);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'SalesCode SFA', 5);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'Salescode B2B App', 6);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'SalesCode Supervisor App', 7);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'SalesCode Portal', 8);

INSERT INTO setu.field_choices ("fieldId", value, position) VALUES (15, 'SalesCode Manager App', 9);

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('category', 'Category', 'nested', true, 15)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('l2Agent', 'L2 Agent', 'dropdown', true, 16)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('helpdeskAnalysis', 'HelpDesk Analysis', 'paragraph', false, 17)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.field_definitions (key, label, type, required, position) VALUES ('rcaSolution', 'RCA/Solution provides', 'paragraph', true, 18)
     ON CONFLICT (key) DO NOTHING RETURNING id;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Sync Issue', 'Multiple Device Sync issue(PAN INDIA)', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Configuration Issues', 'mSecSales App Not Opening', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Configuration Issues', 'SAP mobile Secure Configuration', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Day Start/Day End', 'Day Start Related Issues', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Day Start/Day End', 'Day Start'' icon not appearing after ''Day End''', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Master', 'Product Master Related issue', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Master', 'Promotion Master Related issue', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('mSecSales Application - Login Screen', 'Login / Password Related issue', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.severity_rules (category, "function", severity) VALUES ('Application', '*', 'FATAL') ON CONFLICT DO NOTHING;

INSERT INTO setu.business_hours (name, timezone, days) VALUES ('Default', 'Asia/Kolkata', '[{"day":1,"start":"09:00","end":"20:00"},{"day":2,"start":"09:00","end":"20:00"},{"day":3,"start":"09:00","end":"20:00"},{"day":4,"start":"09:00","end":"20:00"},{"day":5,"start":"09:00","end":"20:00"},{"day":6,"start":"09:00","end":"20:00"}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.groups (name, assignment) VALUES ('Customer Support', 'ROUND_ROBIN') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.groups (name, assignment) VALUES ('L2 Support', 'MANUAL') ON CONFLICT (name) DO NOTHING;

SELECT id, name FROM setu.groups;

INSERT INTO setu.sla_policies (name, "isDefault", position) VALUES ('SLA Metrics & Reminders', false, 0) ON CONFLICT (name) DO NOTHING RETURNING id;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (1, 4, 15, 30, 240, false) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (1, 3, 60, 120, 480, false) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (1, 2, 240, 660, 1980, true) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (1, 1, 366, 1320, 3300, true) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_policy_groups ("policyId", "groupId") VALUES (1, 1) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_policy_groups ("policyId", "groupId") VALUES (1, 2) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_policies (name, "isDefault", position) VALUES ('Default SLA Policy', true, 1) ON CONFLICT (name) DO NOTHING RETURNING id;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (2, 4, 120, NULL, 240, false) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (2, 3, 180, NULL, 360, true) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (2, 2, 240, NULL, 1320, true) ON CONFLICT DO NOTHING;

INSERT INTO setu.sla_targets ("policyId", priority, "firstResponseMins", "nextResponseMins", "resolutionMins", "businessHours")
         VALUES (2, 1, 480, NULL, 3300, true) ON CONFLICT DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Route new tickets to Customer Support', 'ON_CREATE', 0, '{"all":[{"field":"groupId","op":"is_empty"}]}', '[{"type":"setGroup","value":1}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Notify when escalated to L3', 'ON_UPDATE', 0, '{"all":[{"field":"changed","op":"in","value":["statusId"]},{"field":"statusId","op":"eq","value":8}]}', '[{"type":"notifyAgents","template":"agent.escalation_l3","to":"setting","setting":"escalation.notifyEmails"}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Close resolved tickets after 48 hours', 'TIME', 0, '{"all":[{"field":"statusId","op":"in","value":[4]},{"field":"hoursSinceResolved","op":"gt","value":48}]}', '[{"type":"setStatus","value":5}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Move long-overdue tickets to the escalation group', 'TIME', 1, '{"all":[{"field":"statusId","op":"in","value":[2]},{"field":"hoursPastResolutionDue","op":"gt","value":2},{"field":"escalatedAt","op":"is_empty"}]}', '[{"type":"setGroup","setting":"escalation.groupId"},{"type":"markEscalated"}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Close after 96 h without user confirmation', 'TIME', 2, '{"all":[{"field":"statusId","op":"in","value":[9]},{"field":"hoursSinceStatusChange","op":"gte","value":96}]}', '[{"type":"sendReplyTemplate","template":"requester.closing_reminder"},{"type":"setStatus","value":5}]') ON CONFLICT (name) DO NOTHING;

INSERT INTO setu.automation_rules (name, trigger, position, conditions, actions) VALUES ('Close after 14 days without user information', 'TIME', 3, '{"all":[{"field":"statusId","op":"in","value":[12]},{"field":"hoursSinceStatusChange","op":"gte","value":336}]}', '[{"type":"sendReplyTemplate","template":"requester.closing_reminder"},{"type":"setStatus","value":5}]') ON CONFLICT (name) DO NOTHING;

-- v3: last activity, personal canned responses, WhatsApp / portal messages, call logs, in-app bell
ALTER TABLE setu.tickets
    ADD COLUMN IF NOT EXISTS "lastActivityAt" timestamptz,
    ADD COLUMN IF NOT EXISTS "lastActivityKind" text,
    ADD COLUMN IF NOT EXISTS "lastActivityBy" text,
    ADD COLUMN IF NOT EXISTS "lastActivityDetail" text;
CREATE INDEX IF NOT EXISTS tickets_last_activity_idx ON setu.tickets ("lastActivityAt");

ALTER TABLE setu.canned_responses ADD COLUMN IF NOT EXISTS "ownerAgentId" integer REFERENCES setu.agents(id) ON DELETE CASCADE;
ALTER TABLE setu.canned_responses DROP CONSTRAINT IF EXISTS "canned_responses_shortCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS canned_owner_code_idx ON setu.canned_responses (COALESCE("ownerAgentId", 0), lower("shortCode")) WHERE "shortCode" IS NOT NULL;

ALTER TABLE setu.conversations
    ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp', 'portal')),
    ADD COLUMN IF NOT EXISTS "fromPhone" text;
CREATE INDEX IF NOT EXISTS contacts_mobile_idx ON setu.contacts (mobile);

ALTER TABLE setu.agents ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS setu.call_logs (
    id serial PRIMARY KEY,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    "agentId" integer NOT NULL REFERENCES setu.agents(id),
    phone text NOT NULL,
    direction text NOT NULL DEFAULT 'OUTBOUND' CHECK (direction IN ('OUTBOUND', 'INBOUND')),
    outcome text NOT NULL CHECK (outcome IN ('Connected', 'No answer', 'Busy', 'Switched off', 'Wrong number', 'Call back later')),
    "durationSecs" integer NOT NULL DEFAULT 0 CHECK ("durationSecs" BETWEEN 0 AND 86400),
    notes text,
    "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_logs_ticket_idx ON setu.call_logs ("ticketId", "createdAt");

CREATE TABLE IF NOT EXISTS setu.notifications (
    id serial PRIMARY KEY,
    "agentId" integer NOT NULL REFERENCES setu.agents(id) ON DELETE CASCADE,
    "ticketId" integer NOT NULL REFERENCES setu.tickets(id) ON DELETE CASCADE,
    event text NOT NULL CHECK (event IN ('requester_reply', 'new_ticket', 'assigned', 'note')),
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "readAt" timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_agent_idx ON setu.notifications ("agentId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON setu.notifications ("agentId") WHERE "readAt" IS NULL;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('requester.ticket_received', 'requester', 'Ticket Received - {{ticket.subject}} || {{ticket.id}}', 'Dear {{ticket.requester.name}},<br><br>Thank you for writing in. Your request is logged as ticket {{ticket.id}}, and someone from the helpdesk team will reply to you, normally within one working day.<br><br>When you write about this issue again, please keep the ticket number in the subject line so your message reaches the same ticket.<br><br>Regards,<br>Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('reply.signature', 'requester', '-', '#TICKET No - {{ticket.id}}<br><br>Thanks &amp; Regards,<br>{{ticket.agent.name}}<br>Emami Secondary Helpdesk<br>Mail ID - emami.helpdesk@emamigroup.com<br>Phone No - 06289423435') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('forward.signature', 'agent', '-', '#TICKET No - {{ticket.id}}<br><br>Thanks &amp; Regards,<br>Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('requester.closing_reminder', 'requester', '{{ticket.id}} {{ticket.subject}}', 'Hi,<br><br>This is a gentle reminder that we have not received any update from your side, so the ticket is now closed. Please send a new email to open a new ticket.<br><br>Thanks &amp; Regards,<br>Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.assigned_group', 'agent', 'New in {{ticket.group.name}}: {{ticket.subject}} [#{{ticket.id}}]', 'A ticket has been routed to {{ticket.group.name}}.<br><br><b>{{ticket.subject}}</b><br>{{ticket.description}}<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.assigned_agent', 'agent', 'Assigned to you: {{ticket.subject}} [#{{ticket.id}}]', 'Hi {{ticket.agent.name}},<br><br>Ticket {{ticket.id}} is now assigned to you.<br><br><b>{{ticket.subject}}</b><br>{{ticket.description}}<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.requester_replied', 'agent', 'Requester replied: {{ticket.subject}} [#{{ticket.id}}]', 'Hi {{ticket.agent.name}},<br><br>{{ticket.requester.name}} has replied on ticket {{ticket.id}}:<br><br>{{comment.body}}<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.note_added', 'agent', 'Note added: {{ticket.subject}} [#{{ticket.id}}]', 'A colleague added a private note on ticket {{ticket.id}}:<br><br>{{comment.body}}<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.first_response_violated', 'agent', 'First response overdue: {{ticket.subject}} [#{{ticket.id}}]', 'Ticket {{ticket.id}} from {{ticket.requester.email}} was due a first response by {{ticket.first_response_due}} and has not had one.<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.resolution_violated', 'agent', 'Resolution overdue: {{ticket.subject}} [#{{ticket.id}}]', 'Ticket {{ticket.id}} from {{ticket.requester.email}} was due to be resolved by {{ticket.resolution_due}}.<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.first_response_reminder', 'agent', 'First response due soon: {{ticket.subject}} [#{{ticket.id}}]', 'Ticket {{ticket.id}} needs a first response by {{ticket.first_response_due}}.<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.resolution_reminder', 'agent', 'Resolution due soon: {{ticket.subject}} [#{{ticket.id}}]', 'Ticket {{ticket.id}} is due to be resolved by {{ticket.resolution_due}}.<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.email_templates (key, audience, subject, body) VALUES ('agent.escalation_l3', 'agent', 'Escalated to L3: {{ticket.subject}} [#{{ticket.id}}]', 'Ticket {{ticket.id}} has been moved to Escalation to L3 Support.<br><br><b>{{ticket.subject}}</b><br>Assigned to: {{ticket.agent.name}}<br><br>Open ticket: {{ticket.url}}<br><br>Regards,<br>Setu – Emami Secondary Helpdesk') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('escalation.groupId', '0') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('escalation.notifyEmails', '[]') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('sla.reminderMinutes', '30') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('bell.events', '["requester_reply"]') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('bell.scope', '"assignee"') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('portal.enabled', 'true') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('call.mode', '"tel"') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('whatsapp.threadDays', '7') ON CONFLICT (key) DO NOTHING;

INSERT INTO setu.settings (key, value) VALUES ('schema.version', '3') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

COMMIT;
