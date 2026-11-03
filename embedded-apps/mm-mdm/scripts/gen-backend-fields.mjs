// Regenerates backend/mmMdmFields.json (what the hub backend needs of the form definition: which fields are dates,
// which are key fields, the tab ids). Run after src/data/form_definition.json changes:
//   node embedded-apps/mm-mdm/scripts/gen-backend-fields.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const form = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'data', 'form_definition.json'), 'utf8'));
const fields = {};
for (const [k, f] of Object.entries(form.fields)) {
  if (f.type === 'DATS' || f.key) fields[k] = { ...(f.type === 'DATS' ? { type: 'DATS' } : {}), ...(f.key ? { key: true } : {}) };
}
const out = { views: form.views.map((v) => v.id), fields };
fs.writeFileSync(path.join(here, '..', '..', '..', 'backend', 'mmMdmFields.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`views ${out.views.length}, fields ${Object.keys(fields).length}`);
