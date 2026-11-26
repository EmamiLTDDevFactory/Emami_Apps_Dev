/** Mock of MatDocSet (material SPEC_ / ARTWORK_ PDFs), only to see the screens locally. Specification: materials ending in 1, 3 or 6; artwork: ending in 3, 6 or 9. */
type Raw = Record<string, unknown>;
interface Deps { // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: (body: unknown, status?: number, msgs?: any[]) => Response; odataError: (status: number, code: string, message: string) => Response; parseFilter: (f: string) => Map<string, string[]> }
const P = (m: string) => m.padStart(18, '0');
function pdf(text: string): string {
  const body = `BT /F1 18 Tf 60 720 Td (${text.replace(/[()\\]/g, '')}) Tj ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', `<< /Length ${body.length} >>\nstream\n${body}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let s = '%PDF-1.4\n'; const off: number[] = [];
  objs.forEach((o, i) => { off.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return btoa(s);
}
const has = (m: string, t: string) => (t === 'SPEC' ? /[136]$/ : /[369]$/).test(m);
const row = (i: number, mode: string, m: string, t: string, v: number, extra: Raw = {}): Raw => ({
  Rowid: String(i).padStart(12, '0'), Mode: mode, Matnr: P(m), Maktx: `MOCK MATERIAL ${m}`, Mtart: 'VERP', DocType: t, DocId: `FOL29000000000024EXT5100000000${t === 'SPEC' ? 1 : 2}${String(v).padStart(3, '0')}`,
  Title: `${t === 'SPEC' ? 'SPEC' : 'ARTWORK'}_${P(m)}`, FileExt: 'PDF', CreatedBy: 'IT_FCOMMON', AttTs: `2026${String(11 - v).padStart(2, '0')}2510${String(v).padStart(2, '0')}00`, Msg: '', Crdat: null,
  DocSize: 900, Versions: 0, Chunk: 0, Chunks: 0, Content: '', ...extra,
});

export function handleMatDocs(set: string, sp: URLSearchParams, d: Deps): Response | null {
  if (set !== 'MatDocSet') return null;
  const f = d.parseFilter(sp.get('$filter') ?? '');
  const mode = (f.get('Mode') ?? ['L'])[0];
  const type = (f.get('DocType') ?? [''])[0];
  const mats = (f.get('Matnr') ?? []).map((m) => m.replace(/^0+/, ''));
  const rows: Raw[] = []; let i = 0;
  for (const m of mats) for (const t of ['SPEC', 'ART']) {
    if (!has(m, t) || (type && type !== t)) continue;
    if (mode === 'L') rows.push(row(++i, 'L', m, t, 1, { Versions: 3 }));
    else if (mode === 'V') for (const v of [1, 2, 3]) rows.push(row(++i, 'V', m, t, v));
    else if (mode === 'C') {
      const id = (f.get('DocId') ?? [''])[0];
      if (!id.includes(t === 'SPEC' ? 'EXT51000000001' : 'EXT51000000002')) continue;
      rows.push(row(++i, 'C', m, t, Number(id.slice(-3)), { Chunks: 1, Content: pdf(`${t === 'SPEC' ? 'Specification' : 'Artwork'} of ${m} (mock, version ${Number(id.slice(-3))})`) }));
    }
  }
  return d.json({ d: { results: rows } });
}
