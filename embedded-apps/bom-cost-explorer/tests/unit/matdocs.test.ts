import { describe, expect, it } from 'vitest';
import { attachedAt, buildMatDocFilter, isPdf, joinChunks, parseLatest, parseVersions } from '@/lib/matdocs/model';
import { canSeeDocs } from '@/lib/matdocs/access';
import type { MatDocRow } from '@/lib/matdocs/fields';

const r = (o: Partial<MatDocRow>): MatDocRow => ({ Rowid: '1', Mode: 'L', Matnr: '000000000100003656', Maktx: 'X', Mtart: 'ROH', DocType: 'SPEC', DocId: 'FOL29000000000024EXT51000000002993', Title: 'SPEC_100003656', FileExt: 'PDF', CreatedBy: 'U', AttTs: '20261125100622', Msg: '', Crdat: null, DocSize: 93330, Versions: 2, Chunk: 0, Chunks: 0, Content: '', ...o });

describe('material documents', () => {
  it('builds the filter without leading zeros and with the mode, type, document and chunk', () => {
    expect(buildMatDocFilter({ matnr: ['000000000100003656'] })).toBe("Matnr eq '100003656'");
    expect(buildMatDocFilter({ matnr: ['100003656', '100003652'], mode: 'V', type: 'ART' })).toBe("(Matnr eq '100003656' or Matnr eq '100003652') and Mode eq 'V' and DocType eq 'ART'");
    expect(buildMatDocFilter({ matnr: ['1'], mode: 'C', docId: 'FOL29000000000024EXT51000000002993', chunk: 2 })).toBe("Matnr eq '1' and Mode eq 'C' and DocId eq 'FOL29000000000024EXT51000000002993' and Chunk eq 2");
    expect(() => buildMatDocFilter({ matnr: [] })).toThrow();
    expect(() => buildMatDocFilter({ matnr: ["1' or '1"] })).toThrow();
    expect(() => buildMatDocFilter({ matnr: ['1'], docId: "x' or 1" })).toThrow();
  });
  it('keeps the newest attachment per material and type', () => {
    const m = parseLatest([r({}), r({ DocId: 'OLD', AttTs: '20250101000000' }), r({ DocType: 'ART', DocId: 'A1', Title: 'ARTWORK_100003656' }), r({ DocType: 'XX' })]);
    const d = m.get('100003656');
    expect(d?.spec?.docId).toBe('FOL29000000000024EXT51000000002993');
    expect(d?.art?.title).toBe('ARTWORK_100003656');
    expect(d?.spec?.created).toBe('2026-11-25 15:36');
  });
  it('lists versions newest first', () => {
    expect(parseVersions([r({ DocId: 'A', AttTs: '20250101000000' }), r({ DocId: 'B' }), r({ DocType: 'ART', DocId: 'C' })], 'SPEC').map((v) => v.docId)).toEqual(['B', 'A']);
  });
  it('reassembles a PDF from base64 chunks', () => {
    const b = joinChunks([btoa('%PDF-1.'), btoa('4 end')]);
    expect(new TextDecoder().decode(b)).toBe('%PDF-1.4 end');
    expect(isPdf(b)).toBe(true);
    expect(isPdf(joinChunks([btoa('hello')]))).toBe(false);
  });
  it('shows documents to Admin and mat-docs only', () => {
    expect(canSeeDocs('Admin')).toBe(true);
    expect(canSeeDocs('mat-docs')).toBe(true);
    expect(canSeeDocs('User')).toBe(false);
    expect(canSeeDocs('')).toBe(false);
  });
  it('formats the attachment time in India time', () => {
    expect(attachedAt('20261125235900')).toBe('2026-11-26 05:29');
    expect(attachedAt('')).toBe('');
  });
});
