'use strict';
/*
   Samadhan v7 migrations: each step runs in ONE transaction and has a tested down script. Applied steps are recorded
   in samadhan.schema_migrations. Steps marked `explicit` never run on their own at start-up - an operator runs them:

     node backend/samadhan/db/migrate.js status
     node backend/samadhan/db/migrate.js up   <id> --yes
     node backend/samadhan/db/migrate.js down <id> --yes

   The command uses the backend's own PG* settings (backend/.env) and prints only the host and database name.
   Steps that are not `explicit` run by themselves at start-up (db/schema.js), in order.
*/
// As a command, read backend/.env first (the shared pool reads PG* when it is loaded). Values already set win.
if (require.main === module) require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env'), quiet: true });
const shared = require('../../db');
const { CONFIGURED, activeSchema } = require('./pool');

const q = (client, text, params) => client.query(text, params);
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

async function ensureTable(client, schema) {
    await q(client, `CREATE TABLE IF NOT EXISTS ${ident(schema)}.schema_migrations (
        id text PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now(), note text)`);
    // A step an operator rolled back stays down: start-up skips it until it is applied again by hand.
    await q(client, `CREATE TABLE IF NOT EXISTS ${ident(schema)}.schema_migrations_held (id text PRIMARY KEY, "heldAt" timestamptz NOT NULL DEFAULT now())`);
}

async function schemas(client) {
    const { rows } = await q(client, 'SELECT nspname FROM pg_namespace WHERE nspname = $1', [CONFIGURED]);
    return new Set(rows.map((r) => r.nspname));
}

const MIGRATIONS = [
    {
        // Phase 2: Authorization cockpit (master prompt §K). New tables only; nothing existing is changed. Runs by
        // itself at start-up. Down drops exactly these tables (and with them every cockpit row - the base roles in
        // Manage Access are untouched, so everyone falls back to today's Agent / Supervisor / Admin behaviour).
        id: '7.1-auth',
        describe: 'Authorization cockpit tables (auth_profiles, auth_user_profiles, auth_user_scope, auth_permission_overrides, auth_change_log, auth_permission_usage) + 8 seeded custom profiles',
        async up(client) {
            const S = ident(activeSchema());
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_profiles (
                id serial PRIMARY KEY,
                code text NOT NULL UNIQUE,
                name text NOT NULL,
                description text,
                mode text NOT NULL DEFAULT 'add' CHECK (mode IN ('add', 'restrict')),
                keys text[] NOT NULL DEFAULT '{}',
                "scopePreset" jsonb NOT NULL DEFAULT '{}',
                active boolean NOT NULL DEFAULT true,
                "seedKey" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_user_profiles (
                id serial PRIMARY KEY,
                "agentId" int NOT NULL REFERENCES ${S}.agents(id) ON DELETE CASCADE,
                "profileId" int NOT NULL REFERENCES ${S}.auth_profiles(id) ON DELETE CASCADE,
                "validFrom" timestamptz,
                "validTo" timestamptz,
                reason text NOT NULL,
                "createdBy" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                UNIQUE ("agentId", "profileId"))`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_user_scope (
                "agentId" int PRIMARY KEY REFERENCES ${S}.agents(id) ON DELETE CASCADE,
                visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'groups', 'own')),
                workspaces jsonb NOT NULL DEFAULT '"all"',
                applications jsonb NOT NULL DEFAULT '"all"',
                "updatedBy" text,
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_permission_overrides (
                id serial PRIMARY KEY,
                "agentId" int NOT NULL REFERENCES ${S}.agents(id) ON DELETE CASCADE,
                key text NOT NULL,
                effect text NOT NULL CHECK (effect IN ('grant', 'deny')),
                "expiresAt" timestamptz,
                reason text NOT NULL,
                "createdBy" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                UNIQUE ("agentId", key))`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_change_log (
                id serial PRIMARY KEY,
                "actorEmail" text,
                action text NOT NULL,
                target text,
                before jsonb,
                after jsonb,
                reason text,
                "createdAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS auth_change_log_created_idx ON ${S}.auth_change_log ("createdAt")`);
            // Last use of each permission per person (Access review: "unused in 90 days"); written in batches.
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.auth_permission_usage (
                "agentId" int NOT NULL REFERENCES ${S}.agents(id) ON DELETE CASCADE,
                key text NOT NULL,
                "lastUsedAt" timestamptz NOT NULL,
                PRIMARY KEY ("agentId", key))`);
            const { SEED_PROFILES } = require('../lib/authSeed');
            for (const p of SEED_PROFILES) {
                await q(client, `INSERT INTO ${S}.auth_profiles (code, name, description, mode, keys, "scopePreset", "seedKey")
                                 VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING`,
                [p.code, p.name, p.description, p.mode, p.keys, JSON.stringify(p.scopePreset), `7.1-auth:${p.code}`]);
            }
            return `tables created, ${SEED_PROFILES.length} custom profiles seeded`;
        },
        async down(client) {
            const S = ident(activeSchema());
            for (const t of ['auth_permission_usage', 'auth_change_log', 'auth_permission_overrides', 'auth_user_scope', 'auth_user_profiles', 'auth_profiles']) {
                await q(client, `DROP TABLE IF EXISTS ${S}.${t}`);
            }
            return 'cockpit tables dropped';
        },
    },
    {
        // Phase 2: attachments (master prompt §L). A new table plus one new counter column on tickets (default 0, so
        // existing rows and every existing query are unaffected). The unused v1 table "attachments" is left untouched.
        // Down drops the metadata only - the files on the SFTP server stay where they are (list them first
        // with: SELECT "storageRef" FROM <schema>.ticket_attachments if they should be removed too).
        id: '7.1-attachments',
        describe: 'ticket_attachments table + tickets."attachmentCount"',
        async up(client) {
            const S = ident(activeSchema());
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_attachments (
                id serial PRIMARY KEY,
                "ticketId" int NOT NULL REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                "conversationId" int REFERENCES ${S}.conversations(id) ON DELETE SET NULL,
                "fileName" text NOT NULL,
                "contentType" text NOT NULL,
                size bigint NOT NULL CHECK (size >= 0),
                sha256 text,
                "storageAdapter" text NOT NULL,
                "storageKey" text NOT NULL,
                "storageRef" text NOT NULL,
                channel text NOT NULL CHECK (channel IN ('agent', 'portal', 'email')),
                "uploadedByAgentId" int REFERENCES ${S}.agents(id) ON DELETE SET NULL,
                "inlineCid" text,
                "scanStatus" text NOT NULL DEFAULT 'not_scanned' CHECK ("scanStatus" IN ('not_scanned', 'clean', 'infected', 'failed')),
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "deletedAt" timestamptz,
                "deletedReason" text)`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON ${S}.ticket_attachments ("ticketId") WHERE "deletedAt" IS NULL`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_attachments_conv_idx ON ${S}.ticket_attachments ("conversationId") WHERE "conversationId" IS NOT NULL`);
            await q(client, `ALTER TABLE ${S}.tickets ADD COLUMN IF NOT EXISTS "attachmentCount" int NOT NULL DEFAULT 0`);
            return 'ticket_attachments created, tickets."attachmentCount" added';
        },
        async down(client) {
            const S = ident(activeSchema());
            await q(client, `DROP TABLE IF EXISTS ${S}.ticket_attachments`);
            await q(client, `ALTER TABLE ${S}.tickets DROP COLUMN IF EXISTS "attachmentCount"`);
            return 'ticket_attachments dropped, tickets."attachmentCount" dropped (files on the storage server are not touched)';
        },
    },
    {
        // Phase 3: workspaces (service desks) and applications (master prompt §H 6 / 7, §I). Additive: new tables, nullable
        // columns, then the backfill of every existing ticket per the approved docs/v7/APP-MAPPING.md §0 (category /
        // function / type are never changed), then "applicationId" / "workspaceId" get a default (SS / SEC_SALES) and
        // NOT NULL, so every insert path - including old scripts that do not know the columns - stays valid.
        // Only Secondary Sales is enabled; the other workspaces stay off until an Admin turns them on.
        id: '7.2-workspaces',
        describe: 'workspaces, applications, priority_matrix, status/field workspace mapping, mail classification tables; workspace / application columns; ticket backfill',
        async up(client) {
            const S = ident(activeSchema());
            const { WORKSPACES, APPLICATIONS, MATRIX, RECORD_CLASSES, CLASSIFICATION_SOURCES, BACKFILL_SQL } = require('../lib/workspaceSeed');
            const list = (a) => a.map((v) => `'${v}'`).join(', ');
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.workspaces (
                id serial PRIMARY KEY,
                key text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9_]{1,19}$'),
                name text NOT NULL,
                "shortCode" text NOT NULL,
                icon text,
                color text,
                description text,
                enabled boolean NOT NULL DEFAULT false,
                "portalEnabled" boolean NOT NULL DEFAULT false,
                position int NOT NULL DEFAULT 0,
                "priorityMode" text NOT NULL DEFAULT 'SEVERITY_MATRIX' CHECK ("priorityMode" IN ('SEVERITY_MATRIX', 'IMPACT_URGENCY', 'BOTH')),
                "categoryLabel" text NOT NULL DEFAULT 'Category',
                "functionLabel" text NOT NULL DEFAULT 'Function',
                "defaultGroupId" int REFERENCES ${S}.groups(id) ON DELETE SET NULL,
                "defaultSlaPolicyId" int REFERENCES ${S}.sla_policies(id) ON DELETE SET NULL,
                settings jsonb NOT NULL DEFAULT '{}',
                "seedKey" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.applications (
                id serial PRIMARY KEY,
                code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,8}$'),
                name text NOT NULL,
                "workspaceId" int NOT NULL REFERENCES ${S}.workspaces(id),
                description text,
                icon text,
                aliases text[] NOT NULL DEFAULT '{}',
                "techStack" text[] NOT NULL DEFAULT '{}',
                hosting text[] NOT NULL DEFAULT '{}',
                "database" text[] NOT NULL DEFAULT '{}',
                criticality text,
                "businessOwner" text,
                "itOwnerAgentId" int REFERENCES ${S}.agents(id) ON DELETE SET NULL,
                "supportGroupId" int REFERENCES ${S}.groups(id) ON DELETE SET NULL,
                "defaultSlaPolicyId" int REFERENCES ${S}.sla_policies(id) ON DELETE SET NULL,
                "portalVisible" boolean NOT NULL DEFAULT true,
                active boolean NOT NULL DEFAULT true,
                position int NOT NULL DEFAULT 0,
                "seedKey" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.priority_matrix (
                id serial PRIMARY KEY,
                "workspaceId" int NOT NULL REFERENCES ${S}.workspaces(id) ON DELETE CASCADE,
                impact smallint NOT NULL CHECK (impact BETWEEN 1 AND 4),
                urgency smallint NOT NULL CHECK (urgency BETWEEN 1 AND 4),
                priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 4),
                UNIQUE ("workspaceId", impact, urgency))`);
            // A status with no rows here is offered in every workspace (today's statuses keep working everywhere).
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.status_workspaces (
                "statusId" int NOT NULL REFERENCES ${S}.ticket_statuses(id) ON DELETE CASCADE,
                "workspaceId" int NOT NULL REFERENCES ${S}.workspaces(id) ON DELETE CASCADE,
                PRIMARY KEY ("statusId", "workspaceId"))`);
            // Per-workspace field settings. A field with no row for a workspace behaves as today (field_definitions).
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.field_workspaces (
                id serial PRIMARY KEY,
                "fieldId" int NOT NULL REFERENCES ${S}.field_definitions(id) ON DELETE CASCADE,
                "workspaceId" int NOT NULL REFERENCES ${S}.workspaces(id) ON DELETE CASCADE,
                "labelOverride" text,
                "requiredOnCreate" boolean NOT NULL DEFAULT false,
                "requiredBeforeResolve" boolean NOT NULL DEFAULT false,
                visible boolean NOT NULL DEFAULT true,
                position int,
                section text,
                "helpText" text,
                "visibleWhen" jsonb,
                "portalVisible" boolean NOT NULL DEFAULT false,
                UNIQUE ("fieldId", "workspaceId"))`);
            await q(client, `ALTER TABLE ${S}.field_definitions ADD COLUMN IF NOT EXISTS storage text NOT NULL DEFAULT 'column' CHECK (storage IN ('column', 'sap', 'it', 'program', 'custom'))`);
            await q(client, `ALTER TABLE ${S}.field_choices ADD COLUMN IF NOT EXISTS "workspaceId" int REFERENCES ${S}.workspaces(id)`);
            await q(client, `ALTER TABLE ${S}.field_choices ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'`);
            for (const t of ['groups', 'sla_policies', 'severity_rules', 'canned_responses', 'scenarios', 'automation_rules', 'articles', 'email_templates', 'saved_views']) {
                await q(client, `ALTER TABLE ${S}.${t} ADD COLUMN IF NOT EXISTS "workspaceId" int REFERENCES ${S}.workspaces(id)`);
            }
            for (const t of ['sla_policies', 'automation_rules']) {
                await q(client, `ALTER TABLE ${S}.${t} ADD COLUMN IF NOT EXISTS "applicationId" int REFERENCES ${S}.applications(id)`);
            }
            // Single mailbox classification (§J): Admin sender rules and the learning table (suggestions only).
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.mail_sender_rules (
                id serial PRIMARY KEY,
                kind text NOT NULL CHECK (kind IN ('domain', 'email')),
                pattern text NOT NULL,
                "applicationId" int NOT NULL REFERENCES ${S}.applications(id) ON DELETE CASCADE,
                note text,
                active boolean NOT NULL DEFAULT true,
                "createdBy" text,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                UNIQUE (kind, pattern))`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.classification_learning (
                "applicationId" int NOT NULL REFERENCES ${S}.applications(id) ON DELETE CASCADE,
                keyword text NOT NULL,
                hits int NOT NULL DEFAULT 1,
                "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
                PRIMARY KEY ("applicationId", keyword))`);

            // Seeds (once; tagged so down removes exactly these rows)
            for (const w of WORKSPACES) {
                await q(client, `INSERT INTO ${S}.workspaces (key, name, "shortCode", icon, color, description, enabled, "portalEnabled", position, "priorityMode", "categoryLabel", "functionLabel", "seedKey")
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (key) DO NOTHING`,
                [w.key, w.name, w.shortCode, w.icon, w.color, w.description, w.enabled, w.portalEnabled, w.position, w.priorityMode, w.categoryLabel, w.functionLabel, `7.2:${w.key}`]);
            }
            const ws = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.workspaces`)).rows.map((r) => [r.key, r.id]));
            for (const [i, [code, name, wk, aliases, active]] of APPLICATIONS.entries()) {
                await q(client, `INSERT INTO ${S}.applications (code, name, "workspaceId", aliases, active, position, "seedKey") VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING`,
                    [code, name, ws[wk], aliases, active, i + 1, `7.2:${code}`]);
            }
            for (const key of ['SAP', 'S4_PROGRAM', 'DIGITAL_APPS', 'INFRA_IT']) {
                for (const m of MATRIX) {
                    await q(client, `INSERT INTO ${S}.priority_matrix ("workspaceId", impact, urgency, priority) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [ws[key], m.impact, m.urgency, m.priority]);
                }
            }
            // Existing type choices: record class INCIDENT (§H 6); nothing else in Secondary Sales changes.
            await q(client, `UPDATE ${S}.field_choices c SET meta = c.meta || '{"recordClass": "INCIDENT"}'::jsonb
                             FROM ${S}.field_definitions d WHERE d.id = c."fieldId" AND d.key = 'type' AND NOT (c.meta ? 'recordClass')`);

            // Ticket columns, backfill, then the defaults and NOT NULL.
            await q(client, `ALTER TABLE ${S}.tickets
                ADD COLUMN IF NOT EXISTS "workspaceId" int REFERENCES ${S}.workspaces(id),
                ADD COLUMN IF NOT EXISTS "applicationId" int REFERENCES ${S}.applications(id),
                ADD COLUMN IF NOT EXISTS "recordClass" text NOT NULL DEFAULT 'INCIDENT' CHECK ("recordClass" IN (${list(RECORD_CLASSES)})),
                ADD COLUMN IF NOT EXISTS "classificationSource" text CHECK ("classificationSource" IN (${list(CLASSIFICATION_SOURCES)})),
                ADD COLUMN IF NOT EXISTS "classificationConfidence" real,
                ADD COLUMN IF NOT EXISTS impact smallint CHECK (impact BETWEEN 1 AND 4),
                ADD COLUMN IF NOT EXISTS urgency smallint CHECK (urgency BETWEEN 1 AND 4),
                ADD COLUMN IF NOT EXISTS custom jsonb NOT NULL DEFAULT '{}'`);
            const filled = await q(client, `UPDATE ${S}.tickets t SET "applicationId" = a.id, "workspaceId" = a."workspaceId", "classificationSource" = 'backfill'
                FROM ${S}.applications a WHERE t."applicationId" IS NULL AND a.code = (${BACKFILL_SQL})`);
            const ss = (await q(client, `SELECT id, "workspaceId" FROM ${S}.applications WHERE code = 'SS'`)).rows[0];
            await q(client, `ALTER TABLE ${S}.tickets ALTER COLUMN "applicationId" SET DEFAULT ${Number(ss.id)}, ALTER COLUMN "workspaceId" SET DEFAULT ${Number(ss.workspaceId)}`);
            await q(client, `ALTER TABLE ${S}.tickets ALTER COLUMN "applicationId" SET NOT NULL, ALTER COLUMN "workspaceId" SET NOT NULL`);
            for (const [name, cols] of [['ws_status', '"workspaceId", "statusId"'], ['ws_created', '"workspaceId", "createdAt"'], ['app_status', '"applicationId", "statusId"'],
                ['app_created', '"applicationId", "createdAt"'], ['ws_agent', '"workspaceId", "agentId"'], ['record_class', '"recordClass"']]) {
                await q(client, `CREATE INDEX IF NOT EXISTS tickets_${name}_idx ON ${S}.tickets (${cols})`);
            }
            await q(client, `CREATE INDEX IF NOT EXISTS tickets_custom_gin_idx ON ${S}.tickets USING gin (custom)`);
            return `${WORKSPACES.length} workspaces, ${APPLICATIONS.length} applications seeded; ${filled.rowCount} tickets backfilled`;
        },
        async down(client) {
            const S = ident(activeSchema());
            await q(client, `ALTER TABLE ${S}.tickets DROP COLUMN IF EXISTS "workspaceId", DROP COLUMN IF EXISTS "applicationId", DROP COLUMN IF EXISTS "recordClass",
                DROP COLUMN IF EXISTS "classificationSource", DROP COLUMN IF EXISTS "classificationConfidence", DROP COLUMN IF EXISTS impact,
                DROP COLUMN IF EXISTS urgency, DROP COLUMN IF EXISTS custom`);
            for (const t of ['sla_policies', 'automation_rules']) await q(client, `ALTER TABLE ${S}.${t} DROP COLUMN IF EXISTS "applicationId"`);
            for (const t of ['groups', 'sla_policies', 'severity_rules', 'canned_responses', 'scenarios', 'automation_rules', 'articles', 'email_templates', 'saved_views', 'field_choices']) {
                await q(client, `ALTER TABLE ${S}.${t} DROP COLUMN IF EXISTS "workspaceId"`);
            }
            await q(client, `ALTER TABLE ${S}.field_choices DROP COLUMN IF EXISTS meta`);
            await q(client, `ALTER TABLE ${S}.field_definitions DROP COLUMN IF EXISTS storage`);
            for (const t of ['classification_learning', 'mail_sender_rules', 'field_workspaces', 'status_workspaces', 'priority_matrix', 'applications', 'workspaces']) {
                await q(client, `DROP TABLE IF EXISTS ${S}.${t}`);
            }
            return 'workspace / application tables and columns dropped (category, function and type values were never changed)';
        },
    },
    {
        // Generic Samadhan (user, 2026-11-07): one app id 'samadhan' for the hub rows (grants, access history, usage,
        // inbox - only rows of this app); the catalogue for primary sales (SAP), secondary sales on Arteria today and
        // Salescode.AI going forward, digital apps and IT. Labels change only where they are still the seeded ones (an
        // Admin's own names stay). applications.vendor added. Down: removes the vendor column and the two new
        // applications when unused; the hub rows keep the 'samadhan' id.
        id: '7.3-generic',
        describe: "hub rows under app id 'samadhan'; generic catalogue (Arteria / Salescode.AI / SAP primary sales); applications.vendor",
        async up(client) {
            const S = ident(activeSchema());
            const { APPLICATIONS, SEC_SALES_DESC, SAP_DESC } = require('../lib/workspaceSeed');
            const has = async (table) => (await q(client, 'SELECT to_regclass($1) AS t', [table])).rows[0].t !== null;
            const col = async (table, c) => (await q(client, `SELECT 1 FROM information_schema.columns WHERE table_schema = 'emami_apps' AND table_name = $1 AND column_name = $2`, [table, c])).rows.length > 0;
            let hub = 0;
            if (await has('emami_apps.authorized_user_apps')) {
                await q(client, `DELETE FROM emami_apps.authorized_user_apps o WHERE o.app_id = 'setu'
                                 AND EXISTS (SELECT 1 FROM emami_apps.authorized_user_apps n WHERE n.app_id = 'samadhan' AND n.email = o.email)`);
                hub += (await q(client, `UPDATE emami_apps.authorized_user_apps SET app_id = 'samadhan' WHERE app_id = 'setu'`)).rowCount;
            }
            for (const t of ['access_change_history', 'events', 'notifications']) {
                if ((await has(`emami_apps.${t}`)) && (await col(t, 'app_id'))) hub += (await q(client, `UPDATE emami_apps.${t} SET app_id = 'samadhan' WHERE app_id = 'setu'`)).rowCount;
            }
            if ((await has('emami_apps.notifications')) && (await col('notifications', 'ref_key'))) {
                await q(client, `UPDATE emami_apps.notifications n SET ref_key = 'samadhan:' || substr(n.ref_key, 6) WHERE n.ref_key LIKE 'setu:%'
                                 AND NOT EXISTS (SELECT 1 FROM emami_apps.notifications x WHERE x.ref_key = 'samadhan:' || substr(n.ref_key, 6))`);
            }
            await q(client, `ALTER TABLE ${S}.applications ADD COLUMN IF NOT EXISTS vendor text`);
            const OLD = { MSFA: 'mSFA App', RMSFA: 'Rural mSFA App', SUP: 'Supervisor App', MR: 'SalesCode MR App', DMS: 'SalesCode DMS App', SCB2B: 'SalesCode B2B App', B2B: 'B2B App', B2C: 'B2C App' };
            const ws = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.workspaces`)).rows.map((r) => [r.key, r.id]));
            for (const [i, [code, name, wk, aliases, active, vendor]] of APPLICATIONS.entries()) {
                const ins = await q(client, `INSERT INTO ${S}.applications (code, name, "workspaceId", aliases, active, position, vendor, "seedKey") VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                             ON CONFLICT (code) DO NOTHING RETURNING id`, [code, name, ws[wk], aliases, active, i + 1, vendor ?? null, `7.3:${code}`]);
                if (ins.rows.length) continue;
                if (OLD[code]) {
                    await q(client, `UPDATE ${S}.applications SET name = $3, aliases = $4, vendor = COALESCE(vendor, $5), position = $6, "updatedAt" = now()
                                     WHERE code = $1 AND name = $2`, [code, OLD[code], name, aliases, vendor ?? null, i + 1]);
                }
                if (vendor) await q(client, `UPDATE ${S}.applications SET vendor = COALESCE(vendor, $2) WHERE code = $1`, [code, vendor]);
            }
            // The in-house B2B / B2C codes: off unless tickets already use them.
            await q(client, `UPDATE ${S}.applications a SET active = false, aliases = '{}' WHERE a.code IN ('B2B', 'B2C')
                             AND NOT EXISTS (SELECT 1 FROM ${S}.tickets t WHERE t."applicationId" = a.id)`);
            await q(client, `UPDATE ${S}.applications SET aliases = array_remove(aliases, 'setu') WHERE 'setu' = ANY(aliases)`);
            await q(client, `UPDATE ${S}.workspaces SET name = 'SAP & Primary Sales', description = $1, "updatedAt" = now() WHERE key = 'SAP' AND name = 'SAP Support'`, [SAP_DESC]);
            await q(client, `UPDATE ${S}.workspaces SET description = $1, "updatedAt" = now() WHERE key = 'SEC_SALES' AND description LIKE 'Secondary sales and the sales apps%'`, [SEC_SALES_DESC]);
            // One name for the helpdesk in mail and on screens (only where it is still the old default text).
            await q(client, `UPDATE ${S}.email_templates SET subject = replace(subject, 'Emami Service Desk', 'Emami Service Desk'),
                             body = replace(body, 'Emami Service Desk', 'Emami Service Desk') WHERE subject LIKE '%Emami Service Desk%' OR body LIKE '%Emami Service Desk%'`);
            await q(client, `UPDATE ${S}.settings SET value = '"Samadhan – Emami Service Desk"' WHERE key = 'general.helpdeskName' AND value = '"Emami Service Desk"'`);
            return `hub rows moved to 'samadhan': ${hub}; catalogue made generic`;
        },
        async down(client) {
            const S = ident(activeSchema());
            await q(client, `DELETE FROM ${S}.applications a WHERE a."seedKey" IN ('7.3:SCSUP', '7.3:SCB2C')
                             AND NOT EXISTS (SELECT 1 FROM ${S}.tickets t WHERE t."applicationId" = a.id)`);
            await q(client, `ALTER TABLE ${S}.applications DROP COLUMN IF EXISTS vendor`);
            return 'vendor column and unused new applications removed (names and hub rows unchanged)';
        },
    },
    {
        // Phase 4: the SAP & Primary Sales desk (master prompt §H, §I, §O, §P). New tables (SAP details, reference masters,
        // external references), three ticket columns (confidential, root cause, resolution code), the SAP configuration
        // and the per-desk field rules. Secondary Sales is unchanged: its fields, statuses and rules stay as they are
        // (existing automation rules are marked as Secondary Sales rules so they no longer touch other desks).
        // Every row inserted is recorded in settings 'seed.7.4'; down removes exactly those plus the new tables / columns.
        id: '7.4-sap',
        describe: 'SAP details, reference masters, external references; confidential / root cause / resolution code; SAP types, Module -> Sub-process tree, groups, routing, statuses, SLA, canned, scenarios; per-desk field rules',
        async up(client) {
            const S = ident(activeSchema());
            const seed = require('../lib/sapSeed');
            const m = { choiceIds: [], fieldIds: [], groupIds: [], ruleIds: [], salesRuleIds: [], policyIds: [], cannedIds: [], scenarioIds: [], statusIds: [], fieldWsIds: [] };
            await q(client, `ALTER TABLE ${S}.tickets ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false,
                ADD COLUMN IF NOT EXISTS "rootCauseCategory" text, ADD COLUMN IF NOT EXISTS "resolutionCode" text`);
            await q(client, `CREATE INDEX IF NOT EXISTS tickets_confidential_idx ON ${S}.tickets (confidential) WHERE confidential`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ref_masters (
                id serial PRIMARY KEY, kind text NOT NULL CHECK (kind ~ '^[A-Z_]{2,30}$'), code text NOT NULL, description text,
                "parentCode" text, attrs jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
                "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE (kind, code))`);
            await q(client, `CREATE INDEX IF NOT EXISTS ref_masters_kind_idx ON ${S}.ref_masters (kind, code)`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_sap_details (
                "ticketId" int PRIMARY KEY REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                landscape text, "sapSystem" text, "sapClient" text, environment text, tcode text, "fioriAppId" text, "programName" text,
                "errorMessageClass" text, "errorMessageNo" text, "errorText" text, "shortDumpId" text, "idocNumber" text, "idocMessageType" text,
                "batchJob" text, "companyCode" text, plant text, "salesOrg" text, "purchOrg" text, "documentNumbers" jsonb NOT NULL DEFAULT '[]',
                "usersAffected" int, "businessProcess" text, "workaroundAvailable" boolean, "workaroundText" text, reproducible boolean,
                "stepsToReproduce" text, "expectedResult" text, "actualResult" text, "sapNotes" text[] NOT NULL DEFAULT '{}', "sapComponent" text,
                "riseOwner" text, "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_sap_details_sys_idx ON ${S}.ticket_sap_details ("sapSystem", tcode)`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_external_refs (
                id serial PRIMARY KEY, "ticketId" int NOT NULL REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                system text NOT NULL, ref text NOT NULL, status text, priority text, url text, owner text, justification text,
                "openedAt" timestamptz NOT NULL DEFAULT now(), "lastUpdateAt" timestamptz NOT NULL DEFAULT now(), "nudgedAt" timestamptz,
                notes text, "createdBy" int REFERENCES ${S}.agents(id) ON DELETE SET NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_external_refs_idx ON ${S}.ticket_external_refs (system, ref)`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_external_refs_ticket_idx ON ${S}.ticket_external_refs ("ticketId")`);

            const ws = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.workspaces`)).rows.map((r) => [r.key, r.id]));
            const OTHER_DESKS = ['SAP', 'S4_PROGRAM', 'DIGITAL_APPS', 'INFRA_IT'].filter((k) => ws[k]);

            // Statuses (id >= 100) for the non-sales desks.
            const pos = Number((await q(client, `SELECT COALESCE(max(position), 0) AS p FROM ${S}.ticket_statuses`)).rows[0].p);
            for (const [i, [id, name, pauses]] of seed.NEW_STATUSES.entries()) {
                const r = await q(client, `INSERT INTO ${S}.ticket_statuses (id, name, "pausesSla", "isResolved", "isClosed", position) VALUES ($1, $2, $3, false, false, $4)
                                          ON CONFLICT DO NOTHING RETURNING id`, [id, name, pauses, pos + i + 1]);
                if (r.rows.length) m.statusIds.push(id);
                for (const k of OTHER_DESKS) await q(client, `INSERT INTO ${S}.status_workspaces ("statusId", "workspaceId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, ws[k]]);
            }
            const statusId = Object.fromEntries((await q(client, `SELECT id, name FROM ${S}.ticket_statuses`)).rows.map((r) => [r.name, r.id]));

            // Fields: root cause + resolution code (shared lists), and the per-desk rules.
            const maxPos = Number((await q(client, `SELECT COALESCE(max(position), 0) AS p FROM ${S}.field_definitions`)).rows[0].p);
            for (const [i, f] of seed.NEW_FIELDS.entries()) {
                const r = await q(client, `INSERT INTO ${S}.field_definitions (key, label, type, required, position) VALUES ($1, $2, $3, false, $4) ON CONFLICT (key) DO NOTHING RETURNING id`,
                    [f.key, f.label, f.type, maxPos + i + 1]);
                if (!r.rows.length) continue;
                m.fieldIds.push(r.rows[0].id);
                for (const [j, v] of seed.LISTS[f.list].entries()) {
                    m.choiceIds.push((await q(client, `INSERT INTO ${S}.field_choices ("fieldId", value, position) VALUES ($1, $2, $3) RETURNING id`, [r.rows[0].id, v, j + 1])).rows[0].id);
                }
            }
            const fields = (await q(client, `SELECT id, key FROM ${S}.field_definitions`)).rows;
            const newKeys = seed.NEW_FIELDS.map((f) => f.key);
            const REQUIRED = { SAP: ['category', 'rootCauseCategory', 'resolutionCode'], INFRA_IT: ['category', 'resolutionCode'], DIGITAL_APPS: ['category', 'resolutionCode'], S4_PROGRAM: [] };
            const LABEL = { helpdeskAnalysis: 'Analysis', rcaSolution: 'Root cause / solution' };
            for (const f of fields) {
                if (ws.SEC_SALES && newKeys.includes(f.key)) {
                    const r = await q(client, `INSERT INTO ${S}.field_workspaces ("fieldId", "workspaceId", visible, "requiredOnCreate", "requiredBeforeResolve") VALUES ($1, $2, false, false, false)
                                              ON CONFLICT ("fieldId", "workspaceId") DO NOTHING RETURNING id`, [f.id, ws.SEC_SALES]);
                    m.fieldWsIds.push(...r.rows.map((x) => x.id));
                }
                for (const k of OTHER_DESKS) {
                    const r = await q(client, `INSERT INTO ${S}.field_workspaces ("fieldId", "workspaceId", "labelOverride", visible, "requiredOnCreate", "requiredBeforeResolve")
                                              VALUES ($1, $2, $3, $4, false, $5) ON CONFLICT ("fieldId", "workspaceId") DO NOTHING RETURNING id`,
                    [f.id, ws[k], LABEL[f.key] ?? null, !seed.SALES_ONLY_FIELDS.includes(f.key), (REQUIRED[k] || []).includes(f.key)]);
                    m.fieldWsIds.push(...r.rows.map((x) => x.id));
                }
            }

            if (ws.SAP) {
                const field = Object.fromEntries(fields.map((f) => [f.key, f.id]));
                // SAP types with their record class
                for (const [i, [value, rc]] of seed.SAP_TYPES.entries()) {
                    m.choiceIds.push((await q(client, `INSERT INTO ${S}.field_choices ("fieldId", value, position, "workspaceId", meta) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [field.type, value, i + 1, ws.SAP, JSON.stringify({ recordClass: rc })])).rows[0].id);
                }
                // Module -> Sub-process
                let i = 0;
                for (const [module, subs] of [...Object.entries(seed.SAP_TREE), ...seed.SAP_INACTIVE.map((x) => [x, []])]) {
                    const active = !seed.SAP_INACTIVE.includes(module);
                    const pid = (await q(client, `INSERT INTO ${S}.field_choices ("fieldId", value, position, "workspaceId", active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [field.category, module, ++i, ws.SAP, active])).rows[0].id;
                    m.choiceIds.push(pid);
                    for (const [j, sub] of subs.entries()) {
                        m.choiceIds.push((await q(client, `INSERT INTO ${S}.field_choices ("fieldId", "parentId", value, position, "workspaceId") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                            [field.category, pid, sub, j + 1, ws.SAP])).rows[0].id);
                    }
                }
                // Groups, the desk's default group, routing by module
                for (const name of seed.SAP_GROUPS) {
                    const r = await q(client, `INSERT INTO ${S}.groups (name, description, assignment, "workspaceId") VALUES ($1, $2, 'ROUND_ROBIN', $3) ON CONFLICT (name) DO NOTHING RETURNING id`,
                        [name, name === 'SAP Service Desk' ? 'SAP L1 triage - new SAP tickets without a module land here' : null, ws.SAP]);
                    m.groupIds.push(...r.rows.map((x) => x.id));
                }
                const group = Object.fromEntries((await q(client, `SELECT id, name FROM ${S}.groups`)).rows.map((r) => [r.name, r.id]));
                await q(client, `UPDATE ${S}.workspaces SET "defaultGroupId" = $2 WHERE id = $1 AND "defaultGroupId" IS NULL`, [ws.SAP, group['SAP Service Desk']]);
                // Existing rules belong to Secondary Sales from now on (they were written for it).
                m.salesRuleIds = (await q(client, `UPDATE ${S}.automation_rules SET "workspaceId" = $1 WHERE "workspaceId" IS NULL RETURNING id`, [ws.SEC_SALES])).rows.map((r) => r.id);
                let p = 0;
                for (const [module, g] of Object.entries(seed.MODULE_GROUP)) {
                    if (!group[g]) continue;
                    const r = await q(client, `INSERT INTO ${S}.automation_rules (name, trigger, active, position, conditions, actions, "workspaceId") VALUES ($1, 'ON_CREATE', true, $2, $3, $4, $5)
                                              ON CONFLICT (name) DO NOTHING RETURNING id`,
                    [`SAP: ${module} to ${g}`, p++, JSON.stringify({ all: [{ field: 'groupId', op: 'is_empty' }, { field: 'category', op: 'eq', value: module }] }),
                        JSON.stringify([{ type: 'setGroup', value: group[g] }]), ws.SAP]);
                    m.ruleIds.push(...r.rows.map((x) => x.id));
                }
            }
            // SLA policies for SAP / Infra / Digital incidents (§O)
            for (const [k, name] of seed.SLA_WORKSPACES) {
                if (!ws[k]) continue;
                const r = await q(client, `INSERT INTO ${S}.sla_policies (name, "isDefault", position, "workspaceId") VALUES ($1, false, 50, $2) ON CONFLICT (name) DO NOTHING RETURNING id`, [name, ws[k]]);
                if (!r.rows.length) continue;
                m.policyIds.push(r.rows[0].id);
                for (const [prio, fr, res, bh] of seed.SLA_TARGETS) {
                    await q(client, `INSERT INTO ${S}.sla_targets ("policyId", priority, "firstResponseMins", "resolutionMins", "businessHours", escalate) VALUES ($1, $2, $3, $4, $5, true)`,
                        [r.rows[0].id, prio, fr, res, bh]);
                }
                await q(client, `UPDATE ${S}.workspaces SET "defaultSlaPolicyId" = $2 WHERE id = $1 AND "defaultSlaPolicyId" IS NULL`, [ws[k], r.rows[0].id]);
            }
            // Canned responses and scenarios
            for (const [k, folder, title, code, body] of seed.CANNED) {
                if (!ws[k]) continue;
                const r = await q(client, `INSERT INTO ${S}.canned_responses (folder, title, "shortCode", body, "workspaceId")
                                          SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM ${S}.canned_responses WHERE lower("shortCode") = lower($3))
                                          RETURNING id`, [folder, title, code, body.replace(/\n/g, '<br>'), ws[k]]);
                m.cannedIds.push(...r.rows.map((x) => x.id));
            }
            for (const [k, name, description, actions] of seed.SCENARIOS) {
                const resolved = actions.map((a) => (a.type === 'setStatus' ? { type: 'setStatus', value: statusId[a.status] } : a));
                if (resolved.some((a) => a.type === 'setStatus' && !a.value)) continue;
                const r = await q(client, `INSERT INTO ${S}.scenarios (name, description, actions, position, "workspaceId") VALUES ($1, $2, $3, 50, $4) ON CONFLICT (name) DO NOTHING RETURNING id`,
                    [name, description, JSON.stringify(resolved), k ? ws[k] ?? null : null]);
                m.scenarioIds.push(...r.rows.map((x) => x.id));
            }
            // Starter reference masters (the table goes with down, so nothing to record).
            for (const [kind, rows] of Object.entries(seed.STARTER_MASTERS)) {
                for (const [code, description, parentCode] of rows) {
                    await q(client, `INSERT INTO ${S}.ref_masters (kind, code, description, "parentCode") VALUES ($1, $2, $3, $4) ON CONFLICT (kind, code) DO NOTHING`, [kind, code, description, parentCode ?? null]);
                }
            }
            await q(client, `INSERT INTO ${S}.settings (key, value) VALUES ('seed.7.4', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(m)]);
            return `SAP desk configured: ${m.choiceIds.length} choices, ${m.groupIds.length} groups, ${m.ruleIds.length} routing rules, ${m.policyIds.length} SLA policies, ${m.statusIds.length} statuses`;
        },
        async down(client) {
            const S = ident(activeSchema());
            const m = (await q(client, `SELECT value FROM ${S}.settings WHERE key = 'seed.7.4'`)).rows[0]?.value || {};
            const ids = (k) => m[k] || [];
            await q(client, `DELETE FROM ${S}.scenarios WHERE id = ANY($1::int[])`, [ids('scenarioIds')]);
            await q(client, `DELETE FROM ${S}.canned_responses WHERE id = ANY($1::int[])`, [ids('cannedIds')]);
            await q(client, `UPDATE ${S}.workspaces SET "defaultSlaPolicyId" = NULL WHERE "defaultSlaPolicyId" = ANY($1::int[])`, [ids('policyIds')]);
            await q(client, `DELETE FROM ${S}.sla_policies WHERE id = ANY($1::int[])`, [ids('policyIds')]);
            await q(client, `DELETE FROM ${S}.automation_rules WHERE id = ANY($1::int[])`, [ids('ruleIds')]);
            await q(client, `UPDATE ${S}.automation_rules SET "workspaceId" = NULL WHERE id = ANY($1::int[])`, [ids('salesRuleIds')]);
            await q(client, `UPDATE ${S}.workspaces SET "defaultGroupId" = NULL WHERE "defaultGroupId" = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `UPDATE ${S}.tickets SET "groupId" = NULL WHERE "groupId" = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `DELETE FROM ${S}.groups WHERE id = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `DELETE FROM ${S}.field_workspaces WHERE id = ANY($1::int[])`, [ids('fieldWsIds')]);
            await q(client, `DELETE FROM ${S}.field_choices WHERE id = ANY($1::int[])`, [ids('choiceIds')]);
            await q(client, `DELETE FROM ${S}.field_definitions WHERE id = ANY($1::int[])`, [ids('fieldIds')]);
            await q(client, `DELETE FROM ${S}.status_workspaces WHERE "statusId" = ANY($1::int[])`, [ids('statusIds')]);
            await q(client, `DELETE FROM ${S}.ticket_statuses s WHERE s.id = ANY($1::int[]) AND NOT EXISTS (SELECT 1 FROM ${S}.tickets t WHERE t."statusId" = s.id)`, [ids('statusIds')]);
            await q(client, `DROP TABLE IF EXISTS ${S}.ticket_external_refs`);
            await q(client, `DROP TABLE IF EXISTS ${S}.ticket_sap_details`);
            await q(client, `DROP TABLE IF EXISTS ${S}.ref_masters`);
            await q(client, `ALTER TABLE ${S}.tickets DROP COLUMN IF EXISTS confidential, DROP COLUMN IF EXISTS "rootCauseCategory", DROP COLUMN IF EXISTS "resolutionCode"`);
            await q(client, `DELETE FROM ${S}.settings WHERE key = 'seed.7.4'`);
            return 'SAP desk configuration and tables removed';
        },
    },
    {
        // v7 Phase 5 (master prompt §I, §O): IT details; Digital Apps and Infra & IT types, Category -> Sub-category trees,
        // groups, default groups and routing; two generic Sales-app sub-categories; desk canned responses; the Digital Apps
        // agent profile's scope preset fixed (it named a desk code that does not exist).
        // Every row inserted is recorded in settings 'seed.7.5'; down removes exactly those plus the new table.
        id: '7.5-it',
        describe: 'IT details table; Digital Apps / Infra & IT types, category trees, groups, routing; Sales-app sub-categories; canned responses',
        async up(client) {
            const S = ident(activeSchema());
            const seed = require('../lib/itSeed');
            const m = { choiceIds: [], groupIds: [], ruleIds: [], cannedIds: [], defaultGroups: [], profileFixed: false };
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_it_details (
                "ticketId" int PRIMARY KEY REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                layer text, environment text, platform text, "deviceModel" text, os text, browser text, "appVersion" text, url text,
                "apiEndpoint" text, "odataService" text, "httpStatus" text, "correlationId" text, database text, hosting text,
                "serverName" text, "ipOrHost" text, "assetTag" text, "siteLocation" text, "usersAffected" int,
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_it_details_layer_idx ON ${S}.ticket_it_details (layer)`);

            const ws = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.workspaces`)).rows.map((r) => [r.key, r.id]));
            const field = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.field_definitions`)).rows.map((r) => [r.key, r.id]));
            const hasOwn = async (fieldId, wsId) => Number((await q(client, `SELECT count(*) AS n FROM ${S}.field_choices WHERE "fieldId" = $1 AND "workspaceId" = $2`, [fieldId, wsId])).rows[0].n) > 0;
            const addChoice = async (fieldId, value, pos, wsId, parentId = null, meta = null) => {
                const r = await q(client, `INSERT INTO ${S}.field_choices ("fieldId", "parentId", value, position, "workspaceId", meta) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [fieldId, parentId, value, pos, wsId, JSON.stringify(meta ?? {})]);
                m.choiceIds.push(r.rows[0].id);
                return r.rows[0].id;
            };
            for (const [key, types, tree] of [['DIGITAL_APPS', seed.DIGITAL_TYPES, seed.DIGITAL_TREE], ['INFRA_IT', seed.IT_TYPES, seed.INFRA_TREE]]) {
                if (!ws[key]) continue;
                // Only when an Admin has not already built this desk's lists.
                if (field.type && !(await hasOwn(field.type, ws[key]))) {
                    for (const [i, [value, rc]] of types.entries()) await addChoice(field.type, value, i + 1, ws[key], null, { recordClass: rc });
                }
                if (field.category && !(await hasOwn(field.category, ws[key]))) {
                    let i = 0;
                    for (const [cat, subs] of Object.entries(tree)) {
                        const pid = await addChoice(field.category, cat, ++i, ws[key]);
                        for (const [j, sub] of subs.entries()) await addChoice(field.category, sub, j + 1, ws[key], pid);
                    }
                }
                // Groups, the desk's triage group, routing by category.
                for (const name of key === 'DIGITAL_APPS' ? seed.DIGITAL_GROUPS : seed.INFRA_GROUPS) {
                    const r = await q(client, `INSERT INTO ${S}.groups (name, description, assignment, "workspaceId") VALUES ($1, $2, 'ROUND_ROBIN', $3) ON CONFLICT (name) DO NOTHING RETURNING id`,
                        [name, name === seed.DEFAULT_GROUP[key] ? 'Triage - new tickets of this desk without a matching category land here' : null, ws[key]]);
                    m.groupIds.push(...r.rows.map((x) => x.id));
                }
                const group = Object.fromEntries((await q(client, `SELECT id, name FROM ${S}.groups`)).rows.map((r) => [r.name, r.id]));
                const d = await q(client, `UPDATE ${S}.workspaces SET "defaultGroupId" = $2 WHERE id = $1 AND "defaultGroupId" IS NULL RETURNING id`, [ws[key], group[seed.DEFAULT_GROUP[key]]]);
                if (d.rows.length) m.defaultGroups.push(ws[key]);
                let p = 0;
                for (const [cat, g] of Object.entries(seed.CATEGORY_GROUP[key])) {
                    if (!group[g]) continue;
                    const prefix = key === 'DIGITAL_APPS' ? 'Digital' : 'Infra';
                    const r = await q(client, `INSERT INTO ${S}.automation_rules (name, trigger, active, position, conditions, actions, "workspaceId") VALUES ($1, 'ON_CREATE', true, $2, $3, $4, $5)
                                              ON CONFLICT (name) DO NOTHING RETURNING id`,
                    [`${prefix}: ${cat} to ${g}`, 100 + p++, JSON.stringify({ all: [{ field: 'groupId', op: 'is_empty' }, { field: 'category', op: 'eq', value: cat }] }),
                        JSON.stringify([{ type: 'setGroup', value: group[g] }]), ws[key]]);
                    m.ruleIds.push(...r.rows.map((x) => x.id));
                }
            }
            // Secondary Sales: one new category with the two sub-categories that had no equivalent (DISCOVERY §9.1).
            if (ws.SEC_SALES && field.category) {
                const exists = await q(client, `SELECT 1 FROM ${S}.field_choices WHERE "fieldId" = $1 AND "parentId" IS NULL AND value = $2`, [field.category, seed.SALES_APP_CATEGORY]);
                if (!exists.rows.length) {
                    const pos = Number((await q(client, `SELECT COALESCE(max(position), 0) AS p FROM ${S}.field_choices WHERE "fieldId" = $1 AND "parentId" IS NULL`, [field.category])).rows[0].p);
                    const pid = await addChoice(field.category, seed.SALES_APP_CATEGORY, pos + 1, ws.SEC_SALES);
                    for (const [j, sub] of seed.SALES_APP_SUBS.entries()) await addChoice(field.category, sub, j + 1, ws.SEC_SALES, pid);
                }
            }
            for (const [k, folder, title, code, body] of seed.CANNED) {
                if (!ws[k]) continue;
                const r = await q(client, `INSERT INTO ${S}.canned_responses (folder, title, "shortCode", body, "workspaceId")
                                          SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM ${S}.canned_responses WHERE lower("shortCode") = lower($3))
                                          RETURNING id`, [folder, title, code, body.replace(/\n/g, '<br>'), ws[k]]);
                m.cannedIds.push(...r.rows.map((x) => x.id));
            }
            // The Digital Apps agent profile pointed at 'DIGITAL' (no such desk) - fix only an untouched preset.
            const fix = await q(client, `UPDATE ${S}.auth_profiles SET "scopePreset" = '{"workspaces":["DIGITAL_APPS"]}'::jsonb
                                         WHERE code = 'DIGITAL_APPS_AGENT' AND "scopePreset" = '{"workspaces":["DIGITAL"]}'::jsonb RETURNING id`).catch(() => ({ rows: [] }));
            m.profileFixed = fix.rows.length > 0;
            await q(client, `INSERT INTO ${S}.settings (key, value) VALUES ('seed.7.5', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(m)]);
            return `IT desks configured: ${m.choiceIds.length} choices, ${m.groupIds.length} groups, ${m.ruleIds.length} routing rules, ${m.cannedIds.length} canned responses`;
        },
        async down(client) {
            const S = ident(activeSchema());
            const m = (await q(client, `SELECT value FROM ${S}.settings WHERE key = 'seed.7.5'`)).rows[0]?.value || {};
            const ids = (k) => m[k] || [];
            await q(client, `DELETE FROM ${S}.canned_responses WHERE id = ANY($1::int[])`, [ids('cannedIds')]);
            await q(client, `DELETE FROM ${S}.automation_rules WHERE id = ANY($1::int[])`, [ids('ruleIds')]);
            await q(client, `UPDATE ${S}.workspaces SET "defaultGroupId" = NULL WHERE id = ANY($1::int[])`, [ids('defaultGroups')]);
            await q(client, `UPDATE ${S}.workspaces SET "defaultGroupId" = NULL WHERE "defaultGroupId" = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `UPDATE ${S}.tickets SET "groupId" = NULL WHERE "groupId" = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `DELETE FROM ${S}.groups WHERE id = ANY($1::int[])`, [ids('groupIds')]);
            await q(client, `DELETE FROM ${S}.field_choices WHERE id = ANY($1::int[]) AND "parentId" IS NOT NULL`, [ids('choiceIds')]);
            await q(client, `DELETE FROM ${S}.field_choices WHERE id = ANY($1::int[])`, [ids('choiceIds')]);
            if (m.profileFixed) await q(client, `UPDATE ${S}.auth_profiles SET "scopePreset" = '{"workspaces":["DIGITAL"]}'::jsonb WHERE code = 'DIGITAL_APPS_AGENT'`);
            await q(client, `DROP TABLE IF EXISTS ${S}.ticket_it_details`);
            await q(client, `DELETE FROM ${S}.settings WHERE key = 'seed.7.5'`);
            return 'IT desk configuration and table removed';
        },
    },
    {
        // v7 Phase 6 (master prompt §I, §O, §P): transports, change details, approval chains + ticket approvals, the
        // service catalogue and change windows; seeds the six approval chains and the catalogue (§O).
        // Seeded rows are recorded in settings 'seed.7.6'; down drops the new tables (all rows go with them).
        id: '7.6-change',
        describe: 'Transports, change details, approval chains and ticket approvals, service catalogue, change windows; chain and catalogue seeds',
        async up(client) {
            const S = ident(activeSchema());
            const seed = require('../lib/changeSeed');
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_transports (
                id serial PRIMARY KEY, "ticketId" int NOT NULL REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                "trNumber" text NOT NULL, description text, "trType" text, owner text, "sourceSystem" text, status text NOT NULL DEFAULT 'Created',
                "targetSystems" text[] NOT NULL DEFAULT '{}', "importedQasAt" timestamptz, "testedOkBy" text, "testedOkById" int, "approvedForPrdBy" text,
                "importedPrdAt" timestamptz, "returnCode" int, notes text, "createdBy" int REFERENCES ${S}.agents(id) ON DELETE SET NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("ticketId", "trNumber"))`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_transports_tr_idx ON ${S}.ticket_transports ("trNumber")`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_change_details (
                "ticketId" int PRIMARY KEY REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                "changeType" text, "changeRisk" text, "plannedStart" timestamptz, "plannedEnd" timestamptz, "transportsNa" boolean NOT NULL DEFAULT false,
                "testEvidence" text, "implementationPlan" text, "backoutPlan" text, "accessValidTo" timestamptz, "freezeOverrideReason" text,
                "updatedAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_change_planned_idx ON ${S}.ticket_change_details ("plannedStart")`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.approval_chains (
                id serial PRIMARY KEY, name text NOT NULL, "workspaceId" int REFERENCES ${S}.workspaces(id) ON DELETE SET NULL, "applicationId" int,
                "appliesTo" jsonb NOT NULL DEFAULT '{}', steps jsonb NOT NULL DEFAULT '[]', active boolean NOT NULL DEFAULT true, "seedKey" text,
                "createdAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.ticket_approvals (
                id serial PRIMARY KEY, "ticketId" int NOT NULL REFERENCES ${S}.tickets(id) ON DELETE CASCADE,
                "chainId" int REFERENCES ${S}.approval_chains(id) ON DELETE SET NULL, round int NOT NULL DEFAULT 1, "stepNo" int NOT NULL, "stepName" text NOT NULL,
                "approverType" text NOT NULL, "approverAgentId" int REFERENCES ${S}.agents(id) ON DELETE SET NULL, "approverEmail" text,
                state text NOT NULL CHECK (state IN ('Waiting', 'Pending', 'Approved', 'Rejected', 'Cancelled')), decision text, comment text,
                "decidedAt" timestamptz, "decidedBy" text, "dueAt" timestamptz, "remindedAt" timestamptz, "tokenHash" text, "tokenExpiresAt" timestamptz,
                "createdAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_approvals_ticket_idx ON ${S}.ticket_approvals ("ticketId")`);
            await q(client, `CREATE INDEX IF NOT EXISTS ticket_approvals_pending_idx ON ${S}.ticket_approvals (state) WHERE state = 'Pending'`);
            await q(client, `CREATE UNIQUE INDEX IF NOT EXISTS ticket_approvals_token_idx ON ${S}.ticket_approvals ("tokenHash") WHERE "tokenHash" IS NOT NULL`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.service_catalog_items (
                id serial PRIMARY KEY, name text NOT NULL, "workspaceId" int NOT NULL REFERENCES ${S}.workspaces(id) ON DELETE CASCADE, "applicationId" int,
                description text, icon text, "recordClass" text NOT NULL DEFAULT 'SERVICE_REQUEST', "defaultType" text, category text, "function" text,
                "formSchema" jsonb NOT NULL DEFAULT '[]', "approvalChainId" int REFERENCES ${S}.approval_chains(id) ON DELETE SET NULL,
                "fulfilGroupId" int REFERENCES ${S}.groups(id) ON DELETE SET NULL, "slaPolicyId" int, "portalVisible" boolean NOT NULL DEFAULT false,
                active boolean NOT NULL DEFAULT true, position int NOT NULL DEFAULT 100, "seedKey" text, "createdAt" timestamptz NOT NULL DEFAULT now())`);
            await q(client, `CREATE TABLE IF NOT EXISTS ${S}.change_windows (
                id serial PRIMARY KEY, "workspaceId" int REFERENCES ${S}.workspaces(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('FREEZE', 'MAINTENANCE')),
                name text NOT NULL, "startsAt" timestamptz NOT NULL, "endsAt" timestamptz NOT NULL, systems text[] NOT NULL DEFAULT '{}', note text,
                "createdAt" timestamptz NOT NULL DEFAULT now(), CHECK ("endsAt" > "startsAt"))`);
            await q(client, `CREATE INDEX IF NOT EXISTS change_windows_range_idx ON ${S}.change_windows ("startsAt", "endsAt")`);

            const ws = Object.fromEntries((await q(client, `SELECT id, key FROM ${S}.workspaces`)).rows.map((r) => [r.key, r.id]));
            const group = Object.fromEntries((await q(client, `SELECT id, name FROM ${S}.groups`)).rows.map((r) => [r.name, r.id]));
            const chain = {};
            for (const c of seed.CHAINS) {
                const have = (await q(client, `SELECT id FROM ${S}.approval_chains WHERE "seedKey" = $1`, [`7.6:${c.key}`])).rows[0];
                if (have) { chain[c.key] = have.id; continue; }
                if (c.workspace && !ws[c.workspace]) continue;
                chain[c.key] = (await q(client, `INSERT INTO ${S}.approval_chains (name, "workspaceId", "appliesTo", steps, "seedKey") VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [c.name, c.workspace ? ws[c.workspace] : null, JSON.stringify(c.appliesTo), JSON.stringify(c.steps), `7.6:${c.key}`])).rows[0].id;
            }
            let n = 0;
            for (const [i, [k, name, description, icon, rc, category, fn, chainKey, portal, fulfil, form]] of seed.CATALOG.entries()) {
                if (!ws[k]) continue;
                const key = `7.6:${k}:${name}`;
                if ((await q(client, `SELECT 1 FROM ${S}.service_catalog_items WHERE "seedKey" = $1`, [key])).rows.length) continue;
                await q(client, `INSERT INTO ${S}.service_catalog_items (name, "workspaceId", description, icon, "recordClass", category, "function", "formSchema", "approvalChainId",
                    "fulfilGroupId", "portalVisible", position, "seedKey") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [name, ws[k], description, icon, rc, category, fn, JSON.stringify(form), chainKey ? chain[chainKey] ?? null : null, fulfil ? group[fulfil] ?? null : null, portal, i + 1, key]);
                n++;
            }
            await q(client, `INSERT INTO ${S}.settings (key, value) VALUES ('seed.7.6', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify({ chains: Object.keys(chain).length, catalog: n })]);
            return `Change & access: ${Object.keys(chain).length} approval chains, ${n} catalogue items`;
        },
        async down(client) {
            const S = ident(activeSchema());
            for (const t of ['service_catalog_items', 'ticket_approvals', 'approval_chains', 'change_windows', 'ticket_change_details', 'ticket_transports']) {
                await q(client, `DROP TABLE IF EXISTS ${S}.${t}`);
            }
            await q(client, `DELETE FROM ${S}.settings WHERE key = 'seed.7.6'`);
            return 'Change & access tables removed';
        },
    },
];

async function applied(client, schema) {
    await ensureTable(client, schema);
    const { rows } = await q(client, `SELECT id FROM ${ident(schema)}.schema_migrations`);
    return new Set(rows.map((r) => r.id));
}

/** Runs one step in a transaction. dir = 'up' | 'down'. */
async function run(id, dir) {
    const m = MIGRATIONS.find((x) => x.id === id);
    if (!m) throw new Error(`Unknown migration ${id}`);
    const client = await shared.pool.connect();
    try {
        await q(client, 'BEGIN');
        await q(client, "SET LOCAL lock_timeout = '5s'");
        const note = await m[dir](client);
        const schema = CONFIGURED;
        await ensureTable(client, schema);
        if (dir === 'up') {
            await q(client, `INSERT INTO ${ident(schema)}.schema_migrations (id, note) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note, "appliedAt" = now()`, [id, note]);
            await q(client, `DELETE FROM ${ident(schema)}.schema_migrations_held WHERE id = $1`, [id]);
        } else {
            await q(client, `DELETE FROM ${ident(schema)}.schema_migrations WHERE id = $1`, [id]);
            await q(client, `INSERT INTO ${ident(schema)}.schema_migrations_held (id) VALUES ($1) ON CONFLICT DO NOTHING`, [id]);
        }
        await q(client, 'COMMIT');
        return note;
    } catch (err) {
        await q(client, 'ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/** Start-up part (db/schema.js): applies every step that is not explicit and not applied yet, in order. */
async function startup() {
    const schema = activeSchema();
    const client = await shared.pool.connect();
    try {
        const done = await applied(client, schema);
        const held = new Set((await q(client, `SELECT id FROM ${ident(schema)}.schema_migrations_held`)).rows.map((r) => r.id));
        for (const m of MIGRATIONS) {
            if (!m.explicit && !done.has(m.id) && !held.has(m.id)) await run(m.id, 'up');
        }
    } finally {
        client.release();
    }
}

async function status() {
    const client = await shared.pool.connect();
    try {
        const found = await schemas(client);
        const schema = found.has(CONFIGURED) ? CONFIGURED : null;
        const done = schema ? await applied(client, schema) : new Set();
        return { schema, steps: MIGRATIONS.map((m) => ({ id: m.id, explicit: Boolean(m.explicit), applied: done.has(m.id), describe: m.describe })) };
    } finally {
        client.release();
    }
}

module.exports = { MIGRATIONS, run, startup, status };

if (require.main === module) {
    (async () => {
        const [cmd, id] = process.argv.slice(2);
        const yes = process.argv.includes('--yes');
        console.log(`Database: ${process.env.PGHOST || '(default host)'} / ${process.env.PGDATABASE || '(default db)'}`);
        if (cmd === 'status') console.log(JSON.stringify(await status(), null, 2));
        else if ((cmd === 'up' || cmd === 'down') && id) {
            if (!yes) { console.log(`Would run ${cmd} ${id}. Add --yes to run it.`); process.exit(0); }
            console.log(`${cmd} ${id}: ${await run(id, cmd)}`);
        } else {
            console.log('usage: node migrate.js status | up <id> --yes | down <id> --yes');
            process.exitCode = 2;
        }
        await shared.pool.end();
    })().catch(async (err) => { console.error('FAILED:', err.message); await shared.pool.end().catch(() => {}); process.exit(1); });
}
