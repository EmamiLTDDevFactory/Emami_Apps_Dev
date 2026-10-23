// Demo answers for the cost watch screens while recording the tutorial (the real ones come from the hub backend,
// backend/costWatch.js). Materials and plants are the mock SAP's (mock/data.ts). Registered with ctx.route().
const day = (d, h = 6, m = 2) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, m, 0, 0); return t.toISOString(); };
const settings = { prio: ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'], donor: '', lookback: 365, freightDays: 180, stdFrt: false, inclFrt: true, inclCover: true };

const items = [
  { id: 'w1', owner: 'trainer@emamigroup.com', name: 'Hair oils - Kolkata and Guwahati', system: 'NGD', skus: ['FG1001', 'FG1002', 'FG1003'], plants: ['1000', '1100'], qty: '100000', settings, thresholds: {}, recipients: ['trainer@emamigroup.com', 'costing@emamigroup.com'], plan1: 'FY27-BASE', active: true, open_alerts: 4, last_run: day(0, 6, 3) },
  { id: 'w2', owner: 'trainer@emamigroup.com', name: 'Balms and creams', system: 'NGD', skus: ['FG3001', 'FG3002', 'FG2001', 'FG4001'], plants: ['1000'], qty: '50000', settings: { ...settings, stdFrt: true }, thresholds: { r2Pct: 8 }, recipients: ['trainer@emamigroup.com'], plan1: null, active: true, open_alerts: 2, last_run: day(0, 6, 4) },
];

const L = (idnrk, maktx, meins, q, p_inr, f_loc, fx_inr, sel_source) => ({ idnrk, maktx, meins, q, p_inr, r_loc: p_inr, f_loc, fx_inr, sel_source });
const alerts = [
  { id: 'a1', watch_id: 'w1', watch_name: items[0].name, rule: 'R2', severity: 'high', sku: 'FG1003', plant: '1000', idnrk: 'RM0003', direction: 'up', impact_inr: '186400.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(0), last_seen: day(0),
    evidence: { text: 'Component rate moved', maktx: 'Menthol Crystals', before: '1450.0000', after: '1683.0000', pct: 16.07, share_pct: 6.2, delta_per_pc: '1.864000', volume: 100000 },
    before: [L('RM0003', 'Menthol Crystals', 'KG', '0.008000', '1450.0000', '12.0000', '1.0000', 'INFOREC')], after: [L('RM0003', 'Menthol Crystals', 'KG', '0.008000', '1683.0000', '12.0000', '1.0000', 'CONTRACT')] },
  { id: 'a2', watch_id: 'w1', watch_name: items[0].name, rule: 'R1', severity: 'high', sku: 'FG1003', plant: '1000', idnrk: '', direction: 'up', impact_inr: '214000.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(0), last_seen: day(0),
    evidence: { text: 'Cost per finished piece moved', before: '41.2200', after: '43.3600', pct_day: 5.19, pct_30d: 6.8, median_7d: '41.1900', month_start: '40.6000', delta_per_pc: '2.140000', volume: 100000 },
    before: [L('RM0003', 'Menthol Crystals', 'KG', '0.008000', '1450.0000', '12.0000', '1.0000', 'INFOREC'), L('PM0003', 'PET Bottle 300 ml', 'PC', '1.005000', '5.9000', '0.1200', '1.0000', 'CONTRACT'), L('PM0006', 'Mono Carton', 'PC', '1.004000', '1.7500', '0.0400', '1.0000', 'INFOREC')],
    after: [L('RM0003', 'Menthol Crystals', 'KG', '0.008000', '1683.0000', '12.0000', '1.0000', 'CONTRACT'), L('PM0003', 'PET Bottle 300 ml', 'PC', '1.005000', '6.1200', '0.1200', '1.0000', 'CONTRACT'), L('PM0006', 'Mono Carton', 'PC', '1.004000', '1.7500', '0.0400', '1.0000', 'INFOREC')] },
  { id: 'a3', watch_id: 'w1', watch_name: items[0].name, rule: 'R5', severity: 'medium', sku: 'FG1001', plant: '1100', idnrk: 'PM0001', direction: 'up', impact_inr: '9800.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(1), last_seen: day(0),
    evidence: { text: 'Freight per piece jumped', maktx: 'PET Bottle 100 ml', before: '0.080000', after: '0.178000', pct: 122.5, delta_per_pc: '0.098000', volume: 100000 },
    before: [L('PM0001', 'PET Bottle 100 ml', 'PC', '1.005000', '3.1000', '0.0800', '1.0000', 'INFOREC')], after: [L('PM0001', 'PET Bottle 100 ml', 'PC', '1.005000', '3.1000', '0.1780', '1.0000', 'INFOREC')] },
  { id: 'a4', watch_id: 'w2', watch_name: items[1].name, rule: 'R3', severity: 'medium', sku: 'FG3001', plant: '1000', idnrk: 'RM0009', direction: 'worse', impact_inr: '7350.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(0), last_seen: day(0),
    evidence: { text: 'Rate source got worse', maktx: 'Wintergreen Oil', before: 'CONTRACT', after: 'MBEW', delta_per_pc: '0.147000', volume: 50000 },
    before: [L('RM0009', 'Wintergreen Oil', 'KG', '0.001500', '1180.0000', '9.0000', '1.0000', 'CONTRACT')], after: [L('RM0009', 'Wintergreen Oil', 'KG', '0.001500', '1278.0000', '9.0000', '1.0000', 'MBEW')] },
  { id: 'a5', watch_id: 'w1', watch_name: items[0].name, rule: 'R7', severity: 'low', sku: 'FG1002', plant: '1000', idnrk: 'PM0007', direction: 'added', impact_inr: '3800.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(0), last_seen: day(0),
    evidence: { text: 'Component added to the BOM', maktx: 'Shipper Box 5-ply', after: '0.020000', delta_per_pc: '0.038000', volume: 100000 },
    before: [], after: [L('PM0007', 'Shipper Box 5-ply', 'PC', '0.020000', '38.0000', '0.5000', '1.0000', 'INFOREC')] },
  { id: 'a6', watch_id: 'w2', watch_name: items[1].name, rule: 'R6', severity: 'low', sku: 'FG2001', plant: '1000', idnrk: 'RM0005', direction: 'up', impact_inr: '2650.00', status: 'open', ack_by: null, snooze_until: null, first_seen: day(0), last_seen: day(0),
    evidence: { text: 'FX factor moved', maktx: 'Perfume Compound A', before: '89.4000', after: '90.6000', pct: 1.34, delta_per_pc: '0.053000', volume: 50000 },
    before: [L('RM0005', 'Perfume Compound A', 'KG', '0.000500', '3200.0000', '25.0000', '89.4000', 'INFOREC')], after: [L('RM0005', 'Perfume Compound A', 'KG', '0.000500', '3243.0000', '25.0000', '90.6000', 'INFOREC')] },
];

const runs = items.flatMap((w) => w.skus.flatMap((sku) => w.plants.map((plant, i) => ({ id: `${w.id}${sku}${plant}`, ts: day(0, 6, 2 + i), watch_id: w.id, watch_name: w.name, sku, plant, status: 'ok', ms: 2400 + sku.length * 90 + i * 310, sap_ms: 2200 + i * 300, line_count: 14 + i * 3, alerts: alerts.filter((a) => a.sku === sku && a.plant === plant).length, trigger: 'schedule', error: '' }))));
const digests = [
  { id: 'd1', ts: day(0, 6, 9), watch_id: 'w1', watch_name: items[0].name, recipient: 'trainer@emamigroup.com', alert_count: 4, model: 'claude-haiku-5-5', template_used: false, status: 'sent', error: '' },
  { id: 'd2', ts: day(0, 6, 9), watch_id: 'w1', watch_name: items[0].name, recipient: 'costing@emamigroup.com', alert_count: 4, model: 'claude-haiku-5-5', template_used: false, status: 'sent', error: '' },
  { id: 'd3', ts: day(0, 6, 10), watch_id: 'w2', watch_name: items[1].name, recipient: 'trainer@emamigroup.com', alert_count: 2, model: '', template_used: true, status: 'sent', error: '' },
];

const strip = ({ before, after, ...a }) => a;
export async function watchRoute(route) {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname.replace(/^.*\/me\/cost-watch/, '');
  const ok = (json) => route.fulfill({ json: { success: true, ...json } });
  if (path === '/me') return ok({ canEdit: true, isAdmin: true, enabled: true, scheduler: true, system: 'NGD' });
  if (path === '/items' && req.method() === 'GET') return ok({ items });
  if (path === '/items') return ok({ id: 'w3' });
  if (/\/run-now$/.test(path)) return ok({ started: true, runs: 6 });
  if (path === '/alerts') {
    const st = url.searchParams.get('status') || 'open';
    return ok({ alerts: alerts.filter((a) => st === 'all' || a.status === st).sort((a, b) => Number(b.impact_inr) - Number(a.impact_inr)).map(strip) });
  }
  const m = /^\/alerts\/([^/]+)(\/(ack|snooze))?$/.exec(path);
  if (m) {
    const a = alerts.find((x) => x.id === m[1]);
    if (m[3] === 'ack') { a.status = 'acknowledged'; a.ack_by = 'trainer@emamigroup.com'; return ok({}); }
    if (m[3] === 'snooze') { a.status = 'snoozed'; return ok({ days: 7 }); }
    const w = items.find((x) => x.id === a.watch_id);
    return ok({ alert: { ...strip(a), settings: w.settings, qty: w.qty, plan1: w.plan1 }, before: a.before.length ? { ts: day(1), total_per_unit: a.evidence.before ?? '0', lines: a.before } : null, after: { ts: a.last_seen, total_per_unit: a.evidence.after ?? '0', lines: a.after } });
  }
  if (path === '/admin') return ok({ runs, digests, lastRunDate: day(0).slice(0, 10), enabled: true, scheduler: true, system: 'NGD', running: false });
  return route.fulfill({ status: 404, json: { success: false, error: 'not in the tutorial mock' } });
}
