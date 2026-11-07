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
