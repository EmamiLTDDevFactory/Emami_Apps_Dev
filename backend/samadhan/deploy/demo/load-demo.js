'use strict';
/*
   Loads clearly marked DEMO data into Samadhan on the dev backend server, so every screen can be tried.
   Run on 172.17.2.21 with:  bash ~/samadhan-demo/run.sh load      (remove with:  bash ~/samadhan-demo/run.sh remove)

   Safe by design:
   - Writes only to Samadhan's own schema (`samadhan`, or `setu` before the v7.0 rename). Manage Access (emami_apps.authorized_user_apps) is NOT touched - demo
     agents exist only inside Samadhan.
   - Every record is marked: tickets tagged `demo`, people at @demo.samadhan.local (an address that can never receive mail),
     WhatsApp people on +91 90000 0xxxx numbers, distributor codes DEMO-..., canned replies (shared and personal) in the
     "Demo" folder.
   - Also shows the newer features: portal and WhatsApp tickets, requester replies (the "Requester replied" last activity
     and the header bell), logged phone calls and personal canned responses. Bell entries for the real Samadhan agents
     point at demo tickets only and go when the demo is removed. Categories / rules it adds are recorded in
     samadhan.settings 'demo.manifest' so remove-demo.js deletes exactly those.
   - No notifications: the hub inbox / email notifier is switched off inside this process, and requester mail is off.
   - Runs as a one-off process; the running dev backend is not restarted or changed.
*/
const APP = process.env.SAMADHAN_APP_DIR || process.env.SETU_APP_DIR || '/home/emamiadmin/apps/emami-apps-hub-backend-dev';
require(`${APP}/node_modules/dotenv`).config({ path: `${APP}/.env`, quiet: true });
const { pool, resolveSchema, sharedPool } = require(`${APP}/samadhan/db/pool`);
// No notifications at all from the demo: not to the hub inbox, not by email - even if real agents are in the groups.
// (Samadhan's notify.js takes notify from this module, so it is replaced before Samadhan's code is loaded.)
require(`${APP}/notifications`).notify = async () => null;
const { createTicket, updateTicket, addAgentMessage, addRequesterReply } = require(`${APP}/samadhan/lib/tickets`);
const { logActivity, textToHtml, touchActivity } = require(`${APP}/samadhan/lib/util`);

const DOMAIN = 'demo.samadhan.local';
const HOUR = 3_600_000;

const AGENTS = [
  ['priya.sharma', 'Priya Sharma (demo)', 'AVAILABLE'],
  ['rahul.das', 'Rahul Das (demo)', 'LUNCH'],
  ['megha.roy', 'Megha Roy (demo)', 'MEETING'],
  ['arijit.sen', 'Arijit Sen (demo L2)', 'AVAILABLE'],
];
const CATS = {
  'mSecSales Application - Login Screen': ['Login / Password Related issue', 'User Locked'],
  'mSecSales Application - Sync Issue': ['Multiple Device Sync issue(PAN INDIA)', 'Single Device Sync issue'],
  'mSecSales Application - Day Start/Day End': ['Day Start Related Issues', 'Day End not completing'],
  'mSecSales Application - Master': ['Product Master Related issue', 'Promotion Master Related issue', 'Outlet Master Related issue'],
  'SalesCode DMS': ['Invoice not generated', 'Stock mismatch', 'Scheme not applied'],
  'SalesCode SFA': ['Order not punched', 'Beat plan missing'],
  Application: ['App crash'],
};
const SERIOUS = [['mSecSales Application - Sync Issue', 'Single Device Sync issue'], ['SalesCode DMS', 'Stock mismatch'], ['SalesCode DMS', 'Invoice not generated'], ['SalesCode SFA', '*']];
const LISTS = {
  state: ['West Bengal', 'Maharashtra', 'Tamil Nadu', 'Uttar Pradesh', 'Odisha', 'Punjab'],
  depot: ['Kolkata', 'Mumbai', 'Chennai', 'Lucknow', 'Bhubaneswar', 'Ludhiana'],
  asmName: ['Subhash Pal', 'Amit Patil', 'K. Raman', 'Vivek Singh', 'Harpreet Gill'],
  depotCoordinator: ['Rina Ghosh', 'Neha Kulkarni', 'Lakshmi N', 'Pooja Verma', 'Sasmita Das', 'Simran Kaur'],
  l2Agent: ['Arijit Sen', 'SAP Basis Team', 'SalesCode Vendor'],
};
const DISTRIBUTORS = [
  ['DEMO-001', 'ABC Traders (demo)', 'EAST', 'West Bengal', 'Kolkata', 'Subhash Pal', 'Rina Ghosh'],
  ['DEMO-002', 'Shree Ganesh Agencies (demo)', 'WEST', 'Maharashtra', 'Mumbai', 'Amit Patil', 'Neha Kulkarni'],
  ['DEMO-003', 'Balaji Distributors (demo)', 'SOUTH', 'Tamil Nadu', 'Chennai', 'K. Raman', 'Lakshmi N'],
  ['DEMO-004', 'Gupta Enterprises (demo)', 'NORTH', 'Uttar Pradesh', 'Lucknow', 'Vivek Singh', 'Pooja Verma'],
  ['DEMO-005', 'Maa Tara Stores (demo)', 'EAST', 'Odisha', 'Bhubaneswar', 'Subhash Pal', 'Sasmita Das'],
  ['DEMO-006', 'Royal Marketing (demo)', 'NORTH', 'Punjab', 'Ludhiana', 'Harpreet Gill', 'Simran Kaur'],
];
const PEOPLE = [['Ravi Kumar', 'ravi.kumar'], ['Anita Desai', 'anita.desai'], ['Suresh Iyer', 'suresh.iyer'], ['Mohit Gupta', 'mohit.gupta'], ['Bikash Nayak', 'bikash.nayak'], ['Field MR Kolkata', null], ['ASM West', 'asm.west']];
const SUBJECTS = [
  ['Unable to login to mSecSales since morning', 'mSecSales Application - Login Screen', 'Login / Password Related issue'],
  ['Orders not syncing from tablet', 'mSecSales Application - Sync Issue', 'Single Device Sync issue'],
  ['All devices in depot failing to sync', 'mSecSales Application - Sync Issue', 'Multiple Device Sync issue(PAN INDIA)'],
  ['Day start button not visible', 'mSecSales Application - Day Start/Day End', 'Day Start Related Issues'],
  ['New SKU missing in product master', 'mSecSales Application - Master', 'Product Master Related issue'],
  ['Festive scheme not applied on invoice', 'SalesCode DMS', 'Scheme not applied'],
  ['Stock in DMS does not match physical stock', 'SalesCode DMS', 'Stock mismatch'],
  ['Invoice not generated for yesterday orders', 'SalesCode DMS', 'Invoice not generated'],
  ['Beat plan missing for new MR', 'SalesCode SFA', 'Beat plan missing'],
  ['App crashes on opening outlet list', 'Application', 'App crash'],
  ['User locked after password attempts', 'mSecSales Application - Login Screen', 'User Locked'],
  ['Outlet master shows closed outlets', 'mSecSales Application - Master', 'Outlet Master Related issue'],
  ['Day end not completing', 'mSecSales Application - Day Start/Day End', 'Day End not completing'],
  ['Order not punched from SFA', 'SalesCode SFA', 'Order not punched'],
];
const TYPES = ['mSFA', 'SalesCode DMS', 'SalesCode SFA', 'CDMS', 'Rural mSFA'];
const SOURCES = ['Email', 'Phone', 'Phone', 'Email', 'WhatsApp', 'Portal'];

async function main() {
  await resolveSchema(); // samadhan, or the legacy setu schema before the v7.0 rename
  const already = await pool.query(`SELECT count(*)::int AS n FROM samadhan.tickets WHERE 'demo' = ANY(tags)`);
  if (already.rows[0].n > 0) {
    console.log(`Demo data is already loaded (${already.rows[0].n} demo tickets). Run "remove" first to reload.`);
    return;
  }
  const manifest = { choiceIds: [], severityRuleIds: [] };

  // Agents (Samadhan only) and group membership
  const agentIds = {};
  for (const [user, name, availability] of AGENTS) {
    const { rows } = await pool.query(
      `INSERT INTO samadhan.agents (email, name, role, availability) VALUES ($1, $2, 'Agent', $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [`${user}@${DOMAIN}`, name, availability],
    );
    agentIds[user] = rows[0].id;
  }
  const groups = Object.fromEntries((await pool.query('SELECT id, name FROM samadhan.groups')).rows.map((g) => [g.name, g.id]));
  for (const u of ['priya.sharma', 'rahul.das', 'megha.roy']) {
    await pool.query('INSERT INTO samadhan.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [agentIds[u], groups['Customer Support']]);
  }
  await pool.query('INSERT INTO samadhan.group_members ("agentId", "groupId") VALUES ($1, $2) ON CONFLICT DO NOTHING', [agentIds['arijit.sen'], groups['L2 Support']]);

  // Field choices (only the ones that are missing; recorded for removal)
  const fieldId = async (key) => (await pool.query('SELECT id FROM samadhan.field_definitions WHERE key = $1', [key])).rows[0].id;
  const addChoice = async (fid, value, parentId = null) => {
    const found = await pool.query('SELECT id FROM samadhan.field_choices WHERE "fieldId" = $1 AND value = $2 AND "parentId" IS NOT DISTINCT FROM $3', [fid, value, parentId]);
    if (found.rows.length) return found.rows[0].id;
    const { rows } = await pool.query('INSERT INTO samadhan.field_choices ("fieldId", "parentId", value, position) VALUES ($1, $2, $3, 100) RETURNING id', [fid, parentId, value]);
    manifest.choiceIds.push(rows[0].id);
    return rows[0].id;
  };
  const catField = await fieldId('category');
  for (const [cat, fns] of Object.entries(CATS)) {
    const cid = await addChoice(catField, cat);
    for (const fn of fns) await addChoice(catField, fn, cid);
  }
  for (const [key, values] of Object.entries(LISTS)) {
    const fid = await fieldId(key);
    for (const v of values) await addChoice(fid, v);
  }
  for (const [category, fn] of SERIOUS) {
    const { rows } = await pool.query(
      `INSERT INTO samadhan.severity_rules (category, "function", severity) VALUES ($1, $2, 'SERIOUS') ON CONFLICT DO NOTHING RETURNING id`,
      [category, fn],
    );
    if (rows.length) manifest.severityRuleIds.push(rows[0].id);
  }
  await pool.query(`INSERT INTO samadhan.settings (key, value) VALUES ('demo.manifest', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(manifest)]);

  // Distributors and canned replies
  for (const d of DISTRIBUTORS) {
    await pool.query(
      `INSERT INTO samadhan.distributors (code, name, region, state, depot, "asmName", "depotCoordinator", category) VALUES ($1, $2, $3, $4, $5, $6, $7, 'Demo')
       ON CONFLICT (code) DO NOTHING`, d,
    );
  }
  for (const [title, code, body] of [
    ['Password reset done', 'demo-pwd', 'Your mSecSales password has been reset. Please log in with the temporary password sent to your registered mobile number and change it on first login.'],
    ['Sync steps', 'demo-sync', 'Please connect to a stable network, open mSecSales > Settings > Sync, and tap "Full sync". Share a screenshot if the error repeats.'],
    ['Need distributor code', 'demo-dbcode', 'Please share your distributor (DB) code so we can check this for you.'],
  ]) {
    await pool.query(
      `INSERT INTO samadhan.canned_responses (folder, title, "shortCode", body) SELECT 'Demo', $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM samadhan.canned_responses WHERE "ownerAgentId" IS NULL AND lower("shortCode") = $2)`,
      [title, code, body],
    );
  }
  // Personal canned responses (each visible to its demo agent only)
  for (const [user, title, code, body] of [
    ['priya.sharma', 'My sign-off', 'bye', 'Glad we could help. Feel free to reply on this ticket if anything else comes up.'],
    ['priya.sharma', 'Call back', 'callback', 'I tried calling you on your registered number. Please share a good time to call back.'],
    ['rahul.das', 'Need screenshot', 'shot', 'Could you please share a screenshot of the error screen?'],
  ]) {
    await pool.query('INSERT INTO samadhan.canned_responses (folder, title, "shortCode", body, "ownerAgentId") VALUES (\'Demo\', $1, $2, $3, $4)', [title, code, body, agentIds[user]]);
  }

  // Tickets: created with a past createdAt (SLA due dates follow), then worked like real tickets
  const agentsRows = (await pool.query(`SELECT id, name, email FROM samadhan.agents WHERE email LIKE '%@${DOMAIN}'`)).rows;
  const agentBy = (user) => agentsRows.find((a) => a.email === `${user}@${DOMAIN}`);
  const fill = { l2Agent: 'Arijit Sen', rcaSolution: 'Root cause identified and fixed; user confirmed.', helpdeskAnalysis: 'Checked logs and master data.' };
  for (let i = 0; i < 30; i++) {
    const [subject, category, fn] = SUBJECTS[i % SUBJECTS.length];
    const [name, user] = PEOPLE[i % PEOPLE.length];
    const d = DISTRIBUTORS[i % DISTRIBUTORS.length];
    const hoursAgo = i < 8 ? i * 1.3 + 0.3 : i < 16 ? 24 + i * 1.5 : 48 + i * 4;
    const worker = agentBy(['priya.sharma', 'rahul.das', 'megha.roy'][i % 3]);
    const t = await createTicket({
      subject,
      description: textToHtml(`${subject}.\nDistributor ${d[0]} (${d[1]}) reported this ${i % 2 ? 'over phone' : 'by email'}.\nPlease check and resolve.`),
      requester: { email: user ? `${user}@${DOMAIN}` : null, name: `${name} (demo)`, phone: user ? null : '9000000000' },
      source: SOURCES[i % SOURCES.length],
      createdAt: new Date(Date.now() - hoursAgo * HOUR),
      fields: {
        category, function: fn, type: TYPES[i % TYPES.length], distributorCode: d[0], distributorName: d[1], region: d[2], state: d[3], depot: d[4],
        asmName: d[5], depotCoordinator: d[6], salesOrg: i % 3 ? 'EM01 - CCD' : 'EM02 - HCD', callSubject: subject.slice(0, 40), tags: ['demo'],
      },
      actorAgentId: worker.id,
    });
    if (i % 3 !== 2) {
      await addAgentMessage(t.id, { kind: 'REPLY', html: textToHtml(i % 2 ? 'Dear Sir/Madam,\n\nWe are checking this and will update you shortly.' : 'Hi,\n\nPlease try a full sync once and let us know if the issue persists.') }, worker);
    }
    if (i % 4 === 1) await addAgentMessage(t.id, { kind: 'NOTE', html: textToHtml('Checked in SAP: user master is fine. Waiting for device logs.') }, worker);
    const plan = i % 10;
    if (i >= 16 && plan < 5) {
      await updateTicket(t.id, { ...fill, statusId: 4 }, worker.id);
      if (plan < 2) await updateTicket(t.id, { statusId: 5 }, worker.id);
    } else if (plan === 5) await updateTicket(t.id, { statusId: 3 }, worker.id);
    else if (plan === 6) await updateTicket(t.id, { statusId: 15 }, worker.id);
    else if (plan === 7) await updateTicket(t.id, { statusId: 8, groupId: groups['L2 Support'], agentId: agentBy('arijit.sen').id }, worker.id);
    else if (plan === 8) await updateTicket(t.id, { statusId: 12 }, worker.id);
    process.stdout.write('.');
  }
  // Two unassigned tickets waiting in L2 Support (manual group)
  for (const s of ['SAP user creation for new DB', 'Price change not reflecting in DMS']) {
    await createTicket({
      subject: s, description: textToHtml(s), requester: { email: `asm.west@${DOMAIN}`, name: 'ASM West (demo)' }, source: 'Email',
      fields: { groupId: groups['L2 Support'], category: 'SalesCode DMS', function: 'Stock mismatch', tags: ['demo'] },
    });
  }
  // Requester replies on open tickets the agents already answered: "Requester replied" in the list, entries in the bell.
  const answered = (await pool.query(
    `SELECT t.id, c.email FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId" JOIN samadhan.ticket_statuses s ON s.id = t."statusId"
     WHERE 'demo' = ANY(t.tags) AND NOT s."isResolved" AND c.email IS NOT NULL
       AND EXISTS (SELECT 1 FROM samadhan.conversations v WHERE v."ticketId" = t.id AND v.kind = 'REPLY')
     ORDER BY t.id LIMIT 4`,
  )).rows;
  const followUps = ['Tried the full sync, still the same error. Screenshot attached in the next mail.', 'Thanks, it is working now. Please close the ticket.', 'Any update? Our orders are pending since morning.', 'Shared the device logs with the ASM. Please check.'];
  for (const [i, t] of answered.entries()) {
    await addRequesterReply(t.id, { html: textToHtml(followUps[i % followUps.length]), fromEmail: t.email, messageId: `demo-reply-${t.id}@${DOMAIN}`, receivedAt: new Date(Date.now() - (i + 1) * 0.4 * HOUR) });
  }

  // Portal tickets (raised by requesters themselves, no agent)
  for (const [subject, name, user, d] of [
    ['Scheme credit note not received', 'Bikash Nayak', 'bikash.nayak', DISTRIBUTORS[4]],
    ['Need access to SalesCode portal for new accountant', 'Mohit Gupta', 'mohit.gupta', DISTRIBUTORS[3]],
  ]) {
    await createTicket({
      subject, description: textToHtml(`${subject}.
DB code ${d[0]}.`), requester: { email: `${user}@${DOMAIN}`, name: `${name} (demo)` }, source: 'Portal',
      createdAt: new Date(Date.now() - 2 * HOUR),
      fields: { distributorCode: d[0], distributorName: d[1], region: d[2], state: d[3], depot: d[4], asmName: d[5], depotCoordinator: d[6], tags: ['demo'] },
    });
  }

  // WhatsApp conversations: first message, an agent reply (saved only - WhatsApp is not connected here), a follow-up
  const priya = agentBy('priya.sharma');
  for (const [i, [name, phone, first, followUp]] of [
    ['Sanjay Distributor', '+919000000101', 'Hello, mSecSales showing "Sync failed" error since 10 am', 'Done, sync working now. Thanks!'],
    ['Lakshmi Agencies', '+919000000102', 'Invoice not generated for order 45821, please check urgently', 'Still not generated, please call me'],
  ].entries()) {
    const t = await createTicket({
      subject: first, description: textToHtml(first), requester: { name: `${name} (demo)`, mobile: phone }, source: 'WhatsApp',
      createdAt: new Date(Date.now() - (3 + i) * HOUR), messageId: `demo-wa-${i}-1`, channel: 'whatsapp', fromPhone: phone,
      fields: { mobileNo: phone, tags: ['demo'] },
    });
    await addAgentMessage(t.id, { kind: 'REPLY', html: textToHtml('Hi, we are checking this. Please share your DB code.') }, priya);
    await addRequesterReply(t.id, { html: textToHtml(followUp), fromPhone: phone, channel: 'whatsapp', messageId: `demo-wa-${i}-2`, receivedAt: new Date(Date.now() - (1 + i) * 0.5 * HOUR) });
  }

  // Phone calls logged on three tickets
  const callable = (await pool.query(
    `SELECT t.id, t."agentId", COALESCE(t."mobileNo", c.mobile, c.phone, '+919000000000') AS phone FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId"
     WHERE 'demo' = ANY(t.tags) AND t."agentId" IS NOT NULL ORDER BY t.id DESC LIMIT 3`,
  )).rows;
  for (const [i, t] of callable.entries()) {
    const [outcome, secs, notes] = [['Connected', 270, 'Walked the user through a full sync; working now.'], ['No answer', 0, null], ['Call back later', 45, 'User in a meeting, asked to call after 4 pm.']][i];
    const agent = agentsRows.find((a) => a.id === t.agentId) ?? priya;
    await pool.query('INSERT INTO samadhan.call_logs ("ticketId", "agentId", phone, outcome, "durationSecs", notes) VALUES ($1, $2, $3, $4, $5, $6)', [t.id, agent.id, t.phone, outcome, secs, notes]);
    await logActivity(t.id, 'call_logged', { direction: 'OUTBOUND', outcome, minutes: Math.round(secs / 6) / 10 }, agent.id);
    await touchActivity(t.id, 'call', agent.name, `Call to ${t.phone} - ${outcome}`);
  }

  // The bell for the real Samadhan agents (the demo agents above got theirs already): the requester replies just added.
  const realAgents = (await pool.query(`SELECT id FROM samadhan.agents WHERE active AND email NOT LIKE '%@${DOMAIN}'`)).rows.map((r) => r.id);
  const replies = (await pool.query(
    `SELECT DISTINCT ON (t.id) t.id, c.name, v."bodyText", v."createdAt" FROM samadhan.tickets t JOIN samadhan.contacts c ON c.id = t."requesterId"
     JOIN samadhan.conversations v ON v."ticketId" = t.id AND v.kind = 'INCOMING' AND v."messageId" LIKE 'demo-%'
     WHERE 'demo' = ANY(t.tags) AND v."messageId" NOT LIKE '%-1' ORDER BY t.id, v."createdAt" DESC`,
  )).rows;
  for (const agentId of realAgents) {
    for (const r of replies) {
      await pool.query(
        `INSERT INTO samadhan.notifications ("agentId", "ticketId", event, title, body, "createdAt") VALUES ($1, $2, 'requester_reply', $3, $4, $5)`,
        [agentId, r.id, `${r.name} replied on #${r.id}`, String(r.bodyText).slice(0, 200), r.createdAt],
      );
    }
  }

  // Fresh dashboard numbers on the next view
  await pool.query(`DELETE FROM samadhan.ai_insights WHERE key = 'dashboard'`);
  const c = await pool.query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE "agentId" IS NULL)::int AS unassigned FROM samadhan.tickets WHERE 'demo' = ANY(tags)`);
  console.log(`\nDemo data loaded: ${c.rows[0].n} tickets (${c.rows[0].unassigned} unassigned, 2 portal, 2 WhatsApp, ${answered.length + 2} requester replies, ${callable.length} calls), ${DISTRIBUTORS.length} distributors, ${AGENTS.length} demo agents, 3 shared + 3 personal canned replies, bell entries for ${realAgents.length} real agent(s).`);
}

main()
  .catch((e) => { console.error('\nERROR:', e.message); process.exitCode = 1; })
  // A short pause lets background start-up queries finish before the pool closes.
  .finally(() => new Promise((r) => setTimeout(r, 1500)).then(() => sharedPool.end()).then(() => process.exit()));
