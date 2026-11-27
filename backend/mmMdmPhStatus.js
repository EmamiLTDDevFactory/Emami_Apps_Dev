/**
 * Active / deactive status of the product hierarchy masters Product, SKU, Variant and Scheme (T179 levels 3 to 6).
 * SAP's T179 has no such flag, so the status lives in the hub database: no row = active. The F4 helps of the portal list only the
 * active masters, and a request that uses a deactivated one is refused (mmMdmPh.js).
 * Key = level + PRODH (the full path of the master: banner + brand + ... + own code), because one own code can sit under several parents.
 */
const { pool } = require('./db');

/** length of PRODH at each level: banner 2, brand 4, product 4, SKU 3, variant 3, scheme 2 */
const PRODH_LEN = { 3: 10, 4: 13, 5: 16, 6: 18 };
const LEVEL_NAME = { 3: 'Product', 4: 'SKU', 5: 'Variant', 6: 'Scheme' };

let ready = null;
function ensure() {
    if (!ready) {
        ready = pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.mdm_ph_master_status (
                level smallint NOT NULL, prodh varchar(18) NOT NULL, active boolean NOT NULL,
                changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (level, prodh))`)
            .then(() => pool.query(`CREATE TABLE IF NOT EXISTS emami_apps.mdm_ph_master_status_log (
                id bigserial PRIMARY KEY, level smallint NOT NULL, prodh varchar(18) NOT NULL, active boolean NOT NULL,
                changed_by text NOT NULL, changed_at timestamptz NOT NULL DEFAULT now())`))
            .catch((e) => { ready = null; throw e; });
    }
    return ready;
}

/** Map prodh -> { active, by, at } for the masters of a level that were ever switched */
async function statusOf(level) {
    await ensure();
    const r = await pool.query('SELECT prodh, active, changed_by, changed_at FROM emami_apps.mdm_ph_master_status WHERE level = $1', [level]);
    return new Map(r.rows.map((x) => [x.prodh, { active: x.active, by: x.changed_by, at: x.changed_at }]));
}

async function inactiveSet(level) {
    await ensure();
    const r = await pool.query('SELECT prodh FROM emami_apps.mdm_ph_master_status WHERE level = $1 AND active = false', [level]);
    return new Set(r.rows.map((x) => x.prodh));
}

async function isInactive(level, prodh) {
    await ensure();
    const r = await pool.query('SELECT 1 FROM emami_apps.mdm_ph_master_status WHERE level = $1 AND prodh = $2 AND active = false', [level, prodh]);
    return r.rows.length > 0;
}

async function setStatus(level, prodhs, active, by) {
    await ensure();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of prodhs) {
            await client.query(`INSERT INTO emami_apps.mdm_ph_master_status (level, prodh, active, changed_by, changed_at) VALUES ($1, $2, $3, $4, now())
                ON CONFLICT (level, prodh) DO UPDATE SET active = EXCLUDED.active, changed_by = EXCLUDED.changed_by, changed_at = now()`, [level, p, active, by]);
            await client.query('INSERT INTO emami_apps.mdm_ph_master_status_log (level, prodh, active, changed_by) VALUES ($1, $2, $3, $4)', [level, p, active, by]);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw e;
    } finally { client.release(); }
    return prodhs.length;
}

module.exports = { PRODH_LEN, LEVEL_NAME, statusOf, inactiveSet, isInactive, setStatus };
