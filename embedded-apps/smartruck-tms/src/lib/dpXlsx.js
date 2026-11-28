/* =============================================================================
   Minimal xlsx read and write for the planning page - no libraries, works
   offline from a file:// page.

   READ   unzip (central directory) + DecompressionStream('deflate-raw') +
          DOMParser. Returns {sheets:[{name, rows:[[...]]}]}
   WRITE  stored (uncompressed) zip, inline strings, a small style sheet with
          a bold header, a red fill for critical rows and a grey one for held.
   ========================================================================== */
(function (root) {
'use strict';

/* ---------------------------------------------------------------- read */
async function inflateRaw(u8) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip / xlsx file');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(off + 26, true), lxl = dv.getUint16(off + 28, true);
    const start = off + 30 + lnl + lxl;
    files[name] = {method, data: u8.subarray(start, start + csize)};
    p += 46 + nl + xl + cl;
  }
  return files;
}
async function fileText(files, name) {
  const f = files[name]; if (!f) return null;
  const b = f.method === 8 ? await inflateRaw(f.data) : f.data;
  return new TextDecoder().decode(b);
}
const colNum = ref => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };

async function readXlsx(buf) {
  const files = unzip(buf);
  const dp = new DOMParser();
  const sstX = await fileText(files, 'xl/sharedStrings.xml');
  const sst = [];
  if (sstX) dp.parseFromString(sstX, 'application/xml').querySelectorAll('si').forEach(si => {
    sst.push([...si.querySelectorAll('t')].map(t => t.textContent).join(''));
  });
  const wb = dp.parseFromString(await fileText(files, 'xl/workbook.xml'), 'application/xml');
  const rels = dp.parseFromString(await fileText(files, 'xl/_rels/workbook.xml.rels'), 'application/xml');
  const tgt = {}; rels.querySelectorAll('Relationship').forEach(r => tgt[r.getAttribute('Id')] = r.getAttribute('Target'));
  const sheets = [];
  for (const s of wb.querySelectorAll('sheet')) {
    const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let path = tgt[rid] || ''; path = path.replace(/^\//, ''); if (!path.startsWith('xl/')) path = 'xl/' + path;
    const x = await fileText(files, path); if (!x) continue;
    const doc = dp.parseFromString(x, 'application/xml');
    const rows = [];
    doc.querySelectorAll('sheetData > row').forEach(r => {
      const ri = (+r.getAttribute('r') || rows.length + 1) - 1;
      const row = [];
      r.querySelectorAll('c').forEach(c => {
        const ci = colNum(c.getAttribute('r') || ''), t = c.getAttribute('t');
        const v = c.querySelector('v'), is = c.querySelector('is');
        let val = null;
        if (t === 's' && v) val = sst[+v.textContent];
        else if (t === 'inlineStr' && is) val = is.textContent;
        else if (t === 'str' && v) val = v.textContent;
        else if (v) { const n = +v.textContent; val = isNaN(n) ? v.textContent : n; }
        row[ci] = val;
      });
      rows[ri] = row;
    });
    sheets.push({name: s.getAttribute('name'), rows});
  }
  return {sheets};
}

/* --------------------------------------------------------------- write */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(entries) {
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  entries.forEach(([name, text]) => {
    const nb = enc.encode(name), db = typeof text === 'string' ? enc.encode(text) : text, crc = crc32(db);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
    h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, db.length, true); c.setUint32(24, db.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + db.length;
  });
  const cs = cen.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
const xe = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/* sheets: [{name, head?:[...], rows:[[...]], style?:[styleIdPerRow], widths?:[...],
             freeze?:{row, col}, filter?:'A4:Z99' | false}]
   A cell may be a plain value or {v, s} to set its own style.
   styles: 0 normal, 1 header (white on rust), 2 critical fill, 3 held fill,
           4 bold, 5 template header (bold, grey, wrap), 6 #,##0 (zero blank),
           7 0.0 bold, 8 #,##0 bold, 9 #,##0 critical fill, 10 bold navy (template label), 11 open-order fill (blue), 12 #,##0 open-order fill */
function writeXlsx(sheets) {
  const sheetXml = sh => {
    const rows = [];
    const all = sh.head ? [sh.head].concat(sh.rows) : sh.rows;
    const off = sh.head ? 1 : 0;
    let maxC = 0;
    all.forEach((r, ri) => {
      if (!r) return;
      const st = sh.head && ri === 0 ? 1 : (sh.style ? sh.style[ri - off] || 0 : 0);
      maxC = Math.max(maxC, r.length);
      const cells = [];
      for (let ci = 0; ci < r.length; ci++) {
        let v = r[ci], s = st;
        if (v != null && typeof v === 'object') { s = v.s != null ? v.s : st; v = v.v; }
        const ref = colName(ci) + (ri + 1);
        if (v == null || v === '') { if (s) cells.push(`<c r="${ref}" s="${s}"/>`); continue; }
        if (typeof v === 'number' && isFinite(v)) cells.push(`<c r="${ref}" s="${s}"><v>${v}</v></c>`);
        else cells.push(`<c r="${ref}" s="${s}" t="inlineStr"><is><t>${xe(v)}</t></is></c>`);
      }
      rows.push(`<row r="${ri + 1}">${cells.join('')}</row>`);
    });
    const cols = (sh.widths || []).map((w, i) => w ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : '').join('');
    const fz = sh.freeze || (sh.head ? {row: 1, col: 0} : null);
    let pane = '';
    if (fz && (fz.row || fz.col)) {
      const tl = colName(fz.col || 0) + ((fz.row || 0) + 1);
      const ap = fz.row && fz.col ? 'bottomRight' : fz.row ? 'bottomLeft' : 'topRight';
      pane = `<pane${fz.col ? ` xSplit="${fz.col}"` : ''}${fz.row ? ` ySplit="${fz.row}"` : ''} topLeftCell="${tl}" activePane="${ap}" state="frozen"/>`;
    }
    const flt = sh.filter === false ? '' : sh.filter ? `<autoFilter ref="${sh.filter}"/>`
      : sh.head ? `<autoFilter ref="A1:${colName(sh.head.length - 1)}${all.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="13.5"/>${cols ? '<cols>' + cols + '</cols>' : ''}<sheetData>${rows.join('')}</sheetData>${flt}</worksheet>`;
  };
  const X = (n, f, fl, extra) => `<xf numFmtId="${n}" fontId="${f}" fillId="${fl}" borderId="0" xfId="0"${n ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}${extra || ''}/>`;
  const xfs = [X(0, 0, 0), X(0, 1, 2), X(0, 0, 3), X(0, 0, 4), X(0, 2, 0),
               '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>',
               X(164, 0, 0), X(165, 2, 0), X(164, 2, 0), X(164, 0, 3), X(0, 3, 0), X(0, 0, 6), X(164, 0, 6)];
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0;\-#,##0;;@"/><numFmt numFmtId="165" formatCode="#,##0.0;\-#,##0.0;;@"/></numFmts><fonts count="4"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF002060"/><name val="Calibri"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB8471C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFAD2CF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD6E4FF"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xe(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const wbr = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  return zip([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb],
              ['xl/_rels/workbook.xml.rels', wbr], ['xl/styles.xml', styles]]
             .concat(sheets.map((s, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(s)])));
}

const API = {readXlsx, writeXlsx};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.DPX = API;
})(typeof window !== 'undefined' ? window : globalThis);
