import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TOOL_DEFS } from '@/lib/ai/tools/registry';

const root = path.resolve(__dirname, '../..');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const aiFiles = [...walk(path.join(root, 'src/lib/ai')), ...walk(path.join(root, 'src/components/ai'))].filter((f) => /\.(ts|tsx)$/.test(f));
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('the AI layer cannot write to SAP', () => {
  it('no AI file imports or calls a SAP write function', () => {
    for (const f of aiFiles) {
      const t = read(f);
      expect(t, f).not.toMatch(/sapWrite|sapPost|sapPatch|sapPut|sapDelete|\$batch|CSRF|x-csrf-token/i);
    }
  });
  it('the only HTTP method used by AI code is the POST of the chat request to the AI service (gateway.ts)', () => {
    for (const f of aiFiles) {
      const t = read(f);
      const uses = /method:\s*['"](POST|PUT|PATCH|DELETE|MERGE)['"]/.test(t);
      if (path.basename(f) === 'gateway.ts') expect(t).toMatch(/method:\s*'POST'/);
      else expect(uses, f).toBe(false);
    }
  });
  it('the AI layer does not import budget / plan / watch writers', () => {
    for (const f of aiFiles) {
      const t = read(f);
      expect(t, f).not.toMatch(/from ['"][^'"]*(budgetMgmt\/api|watch\/api|plan\/upload|pkg\/save)['"]/);
    }
  });
  it('every assistant tool is a read: no write verb in its name or description', () => {
    expect(TOOL_DEFS.length).toBeGreaterThan(10);
    for (const t of TOOL_DEFS) {
      expect(t.name, t.name).not.toMatch(/^(create|update|delete|save|post|write|set|change|approve|release|submit|send)_/);
      expect(t.description.toLowerCase(), t.name).not.toMatch(/\b(creates?|updates?|deletes?|writes? to sap|posts? to sap|saves? to sap)\b/);
    }
    expect(TOOL_DEFS.map((t) => t.name)).toEqual(expect.arrayContaining(['get_mis', 'get_sales_summary', 'get_margin_summary']));
  });
  it('the key goes only to the AI service, and nothing of the AI code reads SAP credentials', () => {
    for (const f of aiFiles) expect(read(f), f).not.toMatch(/ANTHROPIC|anthropic-ai/i);
  });
});
