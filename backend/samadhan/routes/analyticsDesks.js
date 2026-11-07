'use strict';
/*
   v7 Phase 9 (master prompt §N 9 analytics extras), beside the by-application KPIs of Phase 3:
     - SAP: module heat-map (open / total per module), top T-codes and error messages, external-case ageing;
     - Change: success rate (resolved changes with no failed / reverted transport) and the emergency share;
     - Infra: open P1, mean time to resolve by domain (category).
   Same scope rules as every list (scopeSql); Supervisors and up (screen.analytics).
*/
const express = require('express');
const { pool } = require('../db/pool');
const { wrap } = require('../lib/util');

const router = express.Router();
const missing = (e) => e.code === '42P01' || e.code === '42703';
const q = async (sql, params) => { try { return (await pool.query(sql, params)).rows; } catch (e) { if (missing(e)) return []; throw e; } };

router.get('/analytics/desks', wrap(async (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const { scopeSql } = require('../lib/ticketQuery');
    const s = scopeSql(req.scope, req.agent.id);
    const and = s ? `AND ${s}` : '';
    const from = (join = '') => `FROM samadhan.tickets t JOIN samadhan.ticket_statuses st ON st.id = t."statusId" JOIN samadhan.workspaces w ON w.id = t."workspaceId" ${join}
                  WHERE t."deletedAt" IS NULL AND NOT t.spam AND t."createdAt" >= now() - make_interval(days => $1) ${and}`;
    const base = from();
    const sapJoin = 'JOIN samadhan.ticket_sap_details sd ON sd."ticketId" = t.id';
    const [modules, tcodes, errors, ageing, change, infraP1, infraMttr] = await Promise.all([
        q(`SELECT COALESCE(t.category, 'Unclassified') AS k, count(*)::int AS total, count(*) FILTER (WHERE NOT st."isResolved")::int AS open,
                  count(*) FILTER (WHERE t."resViolated")::int AS breached ${base} AND w.key = 'SAP' GROUP BY 1 ORDER BY total DESC LIMIT 15`, [days]),
        q(`SELECT sd.tcode AS k, count(*)::int AS n ${from(sapJoin)} AND w.key = 'SAP' AND sd.tcode IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 10`, [days]),
        q(`SELECT COALESCE(sd."errorMessageClass" || ' ' || sd."errorMessageNo", left(sd."errorText", 60)) AS k, count(*)::int AS n ${from(sapJoin)} AND w.key = 'SAP'
             AND (sd."errorMessageClass" IS NOT NULL OR sd."errorText" IS NOT NULL) GROUP BY 1 ORDER BY n DESC LIMIT 10`, [days]),
        q(`SELECT CASE WHEN r."lastUpdateAt" > now() - interval '2 days' THEN '0-2 days' WHEN r."lastUpdateAt" > now() - interval '5 days' THEN '3-5 days'
                       WHEN r."lastUpdateAt" > now() - interval '10 days' THEN '6-10 days' ELSE 'over 10 days' END AS k, count(*)::int AS n
           FROM samadhan.ticket_external_refs r JOIN samadhan.tickets t ON t.id = r."ticketId" JOIN samadhan.ticket_statuses st ON st.id = t."statusId"
           WHERE NOT st."isResolved" AND t."deletedAt" IS NULL AND COALESCE(r.status, '') NOT IN ('Closed', 'Confirmed') ${and} GROUP BY 1`, []),
        q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE d."changeType" = 'Emergency')::int AS emergency,
                  count(*) FILTER (WHERE st."isResolved")::int AS resolved,
                  count(*) FILTER (WHERE st."isResolved" AND NOT EXISTS (SELECT 1 FROM samadhan.ticket_transports x WHERE x."ticketId" = t.id AND x.status IN ('Failed (RC ≥ 8)', 'Reverted')))::int AS successful
           ${from('LEFT JOIN samadhan.ticket_change_details d ON d."ticketId" = t.id')} AND t."recordClass" = 'CHANGE'`, [days]),
        q(`SELECT count(*)::int AS n FROM samadhan.tickets t JOIN samadhan.ticket_statuses st ON st.id = t."statusId" JOIN samadhan.workspaces w ON w.id = t."workspaceId"
           WHERE w.key = 'INFRA_IT' AND t.priority = 4 AND NOT st."isResolved" AND t."deletedAt" IS NULL ${and}`, []),
        q(`SELECT COALESCE(t.category, 'Unclassified') AS k, count(*)::int AS n, round(avg(EXTRACT(EPOCH FROM (t."resolvedAt" - t."createdAt")) / 3600)::numeric, 1)::float AS hours
           ${base} AND w.key = 'INFRA_IT' AND t."resolvedAt" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 12`, [days]),
    ]);
    const c = change[0] ?? { total: 0, emergency: 0, resolved: 0, successful: 0 };
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
    res.json({
        success: true, days,
        sap: { modules, tcodes, errors, externalAgeing: ['0-2 days', '3-5 days', '6-10 days', 'over 10 days'].map((k) => ({ k, n: ageing.find((a) => a.k === k)?.n ?? 0 })) },
        change: { total: c.total, emergencyPct: pct(c.emergency, c.total), successPct: pct(c.successful, c.resolved), resolved: c.resolved },
        infra: { p1Open: infraP1[0]?.n ?? 0, mttrByDomain: infraMttr },
    });
}));

module.exports = router;
