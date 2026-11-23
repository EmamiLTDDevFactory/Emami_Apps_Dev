/*
   Storage for what Publicity Expenses keeps itself (everything else is read from SAP):
     exclusion rules, budget versions + lines (OB / RB uploads), settings (mapping overrides), audit log.
   Postgres schema publicity_expenses, created on first use (CREATE ... IF NOT EXISTS, additive only).
   PUBEXP_STORE=memory keeps it in memory (unit tests, e2e/mock-server.js) - never on a server.
*/
const SCHEMA = 'publicity_expenses';

function pgStore(pool) {
    let ready;
    const init = () => ready || (ready = (async () => {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.exclusion_rule (
            id bigserial PRIMARY KEY, dimension text NOT NULL, value_list text[] NOT NULL DEFAULT '{}', pattern text NOT NULL DEFAULT '',
            from_fy int NOT NULL, from_period int NOT NULL, to_fy int, to_period int,
            reason text NOT NULL, active boolean NOT NULL DEFAULT true,
            created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
            updated_by text, updated_at timestamptz)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.budget_version (
            id bigserial PRIMARY KEY, fy int NOT NULL, kind text NOT NULL, version int NOT NULL, status text NOT NULL,
            note text, file_name text, unit text NOT NULL, phasing text NOT NULL, line_count int NOT NULL, total numeric(20,2) NOT NULL,
            uploaded_by text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(), UNIQUE (fy, kind, version))`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.budget_line (
            version_id bigint NOT NULL REFERENCES ${SCHEMA}.budget_version(id) ON DELETE CASCADE,
            company_code text NOT NULL DEFAULT '', reporting_key text NOT NULL, header_group text NOT NULL, site text NOT NULL DEFAULT '',
            annual numeric(20,2) NOT NULL, months numeric(20,2)[] NOT NULL, labels jsonb NOT NULL DEFAULT '{}')`);
        await pool.query(`CREATE INDEX IF NOT EXISTS budget_line_version_idx ON ${SCHEMA}.budget_line (version_id)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.setting (key text PRIMARY KEY, value jsonb NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.audit (id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}')`);
    })().catch((e) => { ready = undefined; throw e; }));

    const ruleRow = (r) => ({
        id: Number(r.id), dimension: r.dimension, values: r.value_list || [], pattern: r.pattern, fromFy: r.from_fy, fromPeriod: r.from_period,
        toFy: r.to_fy, toPeriod: r.to_period, reason: r.reason, active: r.active, createdBy: r.created_by, createdAt: r.created_at,
        updatedBy: r.updated_by, updatedAt: r.updated_at,
    });
    const versionRow = (v) => ({
        id: Number(v.id), fy: v.fy, kind: v.kind, version: v.version, status: v.status, note: v.note, fileName: v.file_name, unit: v.unit,
        phasing: v.phasing, lineCount: v.line_count, total: Number(v.total), uploadedBy: v.uploaded_by, uploadedAt: v.uploaded_at,
    });
    const lineRow = (l) => ({
        companyCode: l.company_code, reportingKey: l.reporting_key, headerGroup: l.header_group, site: l.site,
        annual: Number(l.annual), months: l.months.map(Number), labels: l.labels,
    });
    async function tx(fn) {
        await init();
        const c = await pool.connect();
        try { await c.query('BEGIN'); const out = await fn(c); await c.query('COMMIT'); return out; } catch (e) { await c.query('ROLLBACK').catch(() => null); throw e; } finally { c.release(); }
    }

    return {
        kind: 'postgres',
        rules: {
            async list() { await init(); return (await pool.query(`SELECT * FROM ${SCHEMA}.exclusion_rule ORDER BY id`)).rows.map(ruleRow); },
            async create(r, actor) {
                await init();
                const { rows: [row] } = await pool.query(`INSERT INTO ${SCHEMA}.exclusion_rule (dimension, value_list, pattern, from_fy, from_period, to_fy, to_period, reason, active, created_by)
                    VALUES ($1,$10,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [r.dimension, r.pattern, r.fromFy, r.fromPeriod, r.toFy, r.toPeriod, r.reason, r.active, actor, r.values]);
                return ruleRow(row);
            },
            async update(id, r, actor) {
                await init();
                const { rows: [row] } = await pool.query(`UPDATE ${SCHEMA}.exclusion_rule SET dimension=$2, value_list=$11, pattern=$3, from_fy=$4, from_period=$5, to_fy=$6, to_period=$7, reason=$8, active=$9,
                    updated_by=$10, updated_at=now() WHERE id=$1 RETURNING *`, [id, r.dimension, r.pattern, r.fromFy, r.fromPeriod, r.toFy, r.toPeriod, r.reason, r.active, actor, r.values]);
                return row ? ruleRow(row) : null;
            },
            async remove(id) { await init(); const r = await pool.query(`DELETE FROM ${SCHEMA}.exclusion_rule WHERE id=$1 RETURNING *`, [id]); return r.rows[0] ? ruleRow(r.rows[0]) : null; },
        },
        budget: {
            async versions(fy) {
                await init();
                return (await pool.query(`SELECT * FROM ${SCHEMA}.budget_version WHERE ($1::int IS NULL OR fy=$1) ORDER BY fy DESC, kind, version DESC`, [fy ?? null])).rows.map(versionRow);
            },
            async active(fy) {
                await init();
                const { rows } = await pool.query(`SELECT * FROM ${SCHEMA}.budget_version WHERE fy=$1 AND status='active'`, [fy]);
                const out = {};
                for (const v of rows) {
                    const lines = (await pool.query(`SELECT * FROM ${SCHEMA}.budget_line WHERE version_id=$1`, [v.id])).rows.map(lineRow);
                    out[v.kind] = { version: versionRow(v), lines };
                }
                return out;
            },
            async lines(id) { await init(); return (await pool.query(`SELECT * FROM ${SCHEMA}.budget_line WHERE version_id=$1`, [id])).rows.map(lineRow); },
            async create(meta, lines, actor) {
                return tx(async (c) => {
                    await c.query(`LOCK TABLE ${SCHEMA}.budget_version IN SHARE ROW EXCLUSIVE MODE`);
                    const { rows: [{ n }] } = await c.query(`SELECT COALESCE(MAX(version),0)+1 AS n FROM ${SCHEMA}.budget_version WHERE fy=$1 AND kind=$2`, [meta.fy, meta.kind]);
                    await c.query(`UPDATE ${SCHEMA}.budget_version SET status='superseded' WHERE fy=$1 AND kind=$2 AND status='active'`, [meta.fy, meta.kind]);
                    const total = lines.reduce((s, l) => s + l.annual, 0);
                    const { rows: [v] } = await c.query(`INSERT INTO ${SCHEMA}.budget_version (fy, kind, version, status, note, file_name, unit, phasing, line_count, total, uploaded_by)
                        VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [meta.fy, meta.kind, n, meta.note, meta.fileName, meta.unit, meta.phasing, lines.length, total, actor]);
                    for (let i = 0; i < lines.length; i += 500) {
                        const chunk = lines.slice(i, i + 500);
                        const vals = []; const args = [];
                        chunk.forEach((l, k) => {
                            const b = k * 8;
                            vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7}::numeric[],$${b + 8}::jsonb)`);
                            args.push(v.id, l.companyCode || '', l.reportingKey, l.headerGroup, l.site || '', l.annual, l.months, JSON.stringify(l.labels || {}));
                        });
                        await c.query(`INSERT INTO ${SCHEMA}.budget_line (version_id, company_code, reporting_key, header_group, site, annual, months, labels) VALUES ${vals.join(',')}`, args);
                    }
                    return versionRow(v);
                });
            },
            async activate(id) {
                return tx(async (c) => {
                    const { rows: [v] } = await c.query(`SELECT * FROM ${SCHEMA}.budget_version WHERE id=$1 FOR UPDATE`, [id]);
                    if (!v) return null;
                    await c.query(`UPDATE ${SCHEMA}.budget_version SET status='superseded' WHERE fy=$1 AND kind=$2 AND status='active'`, [v.fy, v.kind]);
                    const { rows: [a] } = await c.query(`UPDATE ${SCHEMA}.budget_version SET status='active' WHERE id=$1 RETURNING *`, [id]);
                    return versionRow(a);
                });
            },
            async deactivate(fy, kind) {
                await init();
                const r = await pool.query(`UPDATE ${SCHEMA}.budget_version SET status='superseded' WHERE fy=$1 AND kind=$2 AND status='active' RETURNING *`, [fy, kind]);
                return r.rows.map(versionRow);
            },
        },
        settings: {
            async get(key) { await init(); const r = await pool.query(`SELECT value FROM ${SCHEMA}.setting WHERE key=$1`, [key]); return r.rows[0]?.value ?? null; },
            async set(key, value, actor) {
                await init();
                await pool.query(`INSERT INTO ${SCHEMA}.setting (key, value, updated_by) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
                    [key, JSON.stringify(value), actor]);
            },
        },
        audit: {
            async add(actor, action, detail) {
                try { await init(); await pool.query(`INSERT INTO ${SCHEMA}.audit (actor, action, detail) VALUES ($1,$2,$3)`, [actor, action, JSON.stringify(detail || {})]); } catch (e) { console.error('[publicity-expenses] audit', e.message); }
            },
            async list(limit = 200) {
                await init();
                return (await pool.query(`SELECT * FROM ${SCHEMA}.audit ORDER BY id DESC LIMIT $1`, [limit])).rows.map((a) => ({ id: Number(a.id), at: a.at, actor: a.actor, action: a.action, detail: a.detail }));
            },
        },
    };
}

function memoryStore() {
    const db = { rules: [], versions: [], lines: new Map(), settings: new Map(), audit: [], seq: 0 };
    const id = () => ++db.seq;
    const now = () => new Date().toISOString();
    const clone = (x) => JSON.parse(JSON.stringify(x));
    return {
        kind: 'memory',
        rules: {
            async list() { return clone(db.rules); },
            async create(r, actor) { const row = { id: id(), ...r, createdBy: actor, createdAt: now(), updatedBy: null, updatedAt: null }; db.rules.push(row); return clone(row); },
            async update(rid, r, actor) {
                const i = db.rules.findIndex((x) => x.id === rid); if (i < 0) return null;
                db.rules[i] = { ...db.rules[i], ...r, id: rid, updatedBy: actor, updatedAt: now() }; return clone(db.rules[i]);
            },
            async remove(rid) { const i = db.rules.findIndex((x) => x.id === rid); if (i < 0) return null; return db.rules.splice(i, 1)[0]; },
        },
        budget: {
            async versions(fy) { return clone(db.versions.filter((v) => fy == null || v.fy === fy).sort((a, b) => b.fy - a.fy || a.kind.localeCompare(b.kind) || b.version - a.version)); },
            async active(fy) {
                const out = {};
                for (const v of db.versions.filter((x) => x.fy === fy && x.status === 'active')) out[v.kind] = { version: clone(v), lines: clone(db.lines.get(v.id)) };
                return out;
            },
            async lines(vid) { return clone(db.lines.get(vid) || []); },
            async create(meta, lines, actor) {
                const n = Math.max(0, ...db.versions.filter((v) => v.fy === meta.fy && v.kind === meta.kind).map((v) => v.version)) + 1;
                for (const v of db.versions) if (v.fy === meta.fy && v.kind === meta.kind && v.status === 'active') v.status = 'superseded';
                const v = { id: id(), fy: meta.fy, kind: meta.kind, version: n, status: 'active', note: meta.note, fileName: meta.fileName, unit: meta.unit, phasing: meta.phasing,
                    lineCount: lines.length, total: Math.round(lines.reduce((s, l) => s + l.annual, 0) * 100) / 100, uploadedBy: actor, uploadedAt: now() };
                db.versions.push(v); db.lines.set(v.id, clone(lines));
                return clone(v);
            },
            async activate(vid) {
                const v = db.versions.find((x) => x.id === vid); if (!v) return null;
                for (const x of db.versions) if (x.fy === v.fy && x.kind === v.kind && x.status === 'active') x.status = 'superseded';
                v.status = 'active'; return clone(v);
            },
            async deactivate(fy, kind) {
                const out = [];
                for (const v of db.versions) if (v.fy === fy && v.kind === kind && v.status === 'active') { v.status = 'superseded'; out.push(clone(v)); }
                return out;
            },
        },
        settings: {
            async get(key) { return db.settings.has(key) ? clone(db.settings.get(key)) : null; },
            async set(key, value) { db.settings.set(key, clone(value)); },
        },
        audit: {
            async add(actor, action, detail) { db.audit.unshift({ id: id(), at: now(), actor, action, detail: detail || {} }); },
            async list(limit = 200) { return clone(db.audit.slice(0, limit)); },
        },
    };
}

let current = null;
function getStore() {
    if (!current) current = (process.env.PUBEXP_STORE || '').trim().toLowerCase() === 'memory' ? memoryStore() : pgStore(require('../db').pool);
    return current;
}
/** Test seam: a fresh in-memory store. */
function resetMemoryStore() { current = memoryStore(); return current; }

module.exports = { getStore, resetMemoryStore, memoryStore, pgStore };
