// On a PC (not the server): node extract-pulsedesk.js "D:\downloads\pulsedesk-ver1" pulsedesk-data.json
// then copy pulsedesk-data.json to ~/setu-demo/ on the server and run: bash ~/setu-demo/run.sh load-pulsedesk
// Runs PulseDesk's deterministic data generator (src/server/seed.ts) and dumps its output plus the
// configuration lists (src/lib/config.ts) as JSON. Usage: node extract-pulsedesk.js <pulsedesk folder> <out.json>
const fs = require('fs');
const path = require('path');
const [src, out] = process.argv.slice(2);
const ts = require(path.join(src, 'node_modules', 'typescript'));
const work = path.join(require("os").tmpdir(), "pulsedesk-extract");
fs.mkdirSync(work, { recursive: true });
for (const [from, name] of [['src/lib/config.ts', 'config'], ['src/lib/sla.ts', 'sla'], ['src/server/seed.ts', 'seed']]) {
  const code = fs.readFileSync(path.join(src, from), 'utf8').replace(/["']@\/lib\/(\w+)["']/g, '"./$1"');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  fs.writeFileSync(path.join(work, `${name}.js`), js);
}
const config = require(path.join(work, 'config.js'));
const { buildSeed } = require(path.join(work, 'seed.js'));
const db = buildSeed();
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
const data = {
  generatedAt: new Date().toISOString(),
  config: pick(config, ['CATEGORY_TREE', 'STATES', 'DEPOTS', 'DEPOT_GEO', 'ASM_NAMES', 'DEPOT_COORDINATORS', 'L2_AGENTS', 'REGIONS', 'SALES_ORGS', 'TICKET_TYPES', 'STATUSES', 'SOURCES']),
  db: pick(db, ['agents', 'groups', 'companies', 'contacts', 'tickets', 'conversations', 'timeEntries', 'calls', 'articles']),
};
fs.writeFileSync(out, JSON.stringify(data));
console.log('tickets', db.tickets.length, 'contacts', db.contacts.length, 'conversations', db.conversations.length, 'calls', db.calls.length,
  'timeEntries', db.timeEntries.length, 'articles', db.articles.length, 'csat', db.tickets.filter((t) => t.csat).length, 'bytes', fs.statSync(out).size);
