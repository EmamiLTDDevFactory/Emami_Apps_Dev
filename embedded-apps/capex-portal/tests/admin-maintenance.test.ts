import { describe, it, expect } from 'vitest';
import { normalizeUser, normalizeDoa, validateUser, validateDoa, toRuleLike, type AdminUser, type AdminDoa } from '../lib/admin';

const user = (o: Partial<AdminUser> = {}): AdminUser => ({ userid: 'U1', fullname: 'A', email: 'a@x.com', role: 'Unit Head', unit: 'UN13', isAdmin: false, isGlobal: false, active: true, plants: ['UN13'], ...o });
const doa = (o: Partial<AdminDoa> = {}): AdminDoa => ({ doaid: 'D1', capextype: 'IT', doctype: 'CPE', amountFrom: 0, amountTo: 100, waers: 'INR', rangeText: '', active: true, validFrom: '', validTo: '',
  chain: [{ role: 'Head', approver: 'U1', slaDays: 2, mandatory: true, evalReq: false }], ...o });

describe('maintenance rows from SAP (blank and zero values are dropped from the JSON)', () => {
  it('defaults a user', () => {
    const u = normalizeUser({ userid: 'X', fullname: 'N', email: 'n@x.com', role: 'R', active: 'X', plants: ['UN13'] });
    expect(u).toMatchObject({ unit: '', isAdmin: false, isGlobal: false, active: true, plants: ['UN13'] });
    expect(normalizeUser({ userid: 'Y' }).plants).toEqual([]);
  });
  it('defaults a DOA rule and orders the chain by seqnr', () => {
    const d = normalizeDoa({ doaid: 'D2', capextype: '*', chain: [{ seqnr: 2, role: 'B', slaDays: 3, mandatory: 'X' }, { seqnr: 1, role: 'A' }] });
    expect(d.amountFrom).toBe(0); expect(d.active).toBe(false); expect(d.doctype).toBe(''); expect(d.waers).toBe('INR');
    expect(d.chain.map((c) => c.role)).toEqual(['A', 'B']);
    expect(d.chain[1]).toMatchObject({ slaDays: 3, mandatory: true, evalReq: false });
  });
});

describe('validateUser', () => {
  it('accepts a good user', () => expect(validateUser(user(), true, [])).toBe(''));
  it('needs the basics and a real e-mail', () => {
    expect(validateUser(user({ fullname: '' }), true, [])).toMatch(/required/);
    expect(validateUser(user({ email: 'nope' }), true, [])).toMatch(/valid e-mail/);
  });
  it('refuses a duplicate id on add, and a second active user with the same e-mail (any case)', () => {
    expect(validateUser(user(), true, [user()])).toMatch(/already exists/);
    expect(validateUser(user({ userid: 'U2', email: 'A@X.com' }), true, [user()])).toMatch(/already belongs/);
    expect(validateUser(user({ userid: 'U2', email: 'A@X.com', active: false }), true, [user()])).toBe('');
  });
  it('editing yourself is not a clash; a non-global user needs a plant', () => {
    expect(validateUser(user(), false, [user()])).toBe('');
    expect(validateUser(user({ plants: [] }), false, [])).toMatch(/plant/);
    expect(validateUser(user({ plants: [], isGlobal: true }), false, [])).toBe('');
  });
});

describe('validateDoa', () => {
  it('accepts a good rule', () => expect(validateDoa(doa(), [])).toBe(''));
  it('active rules need CPE or BUD; inactive legacy rules may have none', () => {
    expect(validateDoa(doa({ doctype: '' }), [])).toMatch(/document type/);
    expect(validateDoa(doa({ doctype: '', active: false }), [])).toBe('');
  });
  it('checks amounts, dates and the chain', () => {
    expect(validateDoa(doa({ amountFrom: 50, amountTo: 10 }), [])).toMatch(/upper amount/);
    expect(validateDoa(doa({ validFrom: '2026-04-01', validTo: '2026-03-01' }), [])).toMatch(/Valid to/);
    expect(validateDoa(doa({ chain: [] }), [])).toMatch(/at least one/);
    expect(validateDoa(doa({ chain: [{ role: ' ', approver: '', slaDays: 1, mandatory: true, evalReq: false }] }), [])).toMatch(/needs a role/);
  });
  it('blocks an overlapping active rule of the same type, not another type or an inactive one', () => {
    const other = doa({ doaid: 'D2', amountFrom: 50, amountTo: 200 });
    expect(validateDoa(doa(), [other])).toMatch(/D2/);
    expect(validateDoa(doa(), [{ ...other, capextype: 'MOULDS' }])).toBe('');
    expect(validateDoa(doa(), [{ ...other, active: false }])).toBe('');
    expect(validateDoa(doa({ amountFrom: 0, amountTo: 100 }), [doa({ doaid: 'D2', amountFrom: 101, amountTo: 200 })])).toBe('');
  });
});

describe('simulator shape', () => {
  it('maps the chain to what resolveDOA reads', () => {
    const r = toRuleLike(doa());
    expect(r).toMatchObject({ Doaid: 'D1', Capextype: 'IT', Doctype: 'CPE', Active: 'X' });
    expect(r.chain?.[0]).toMatchObject({ Seqnr: '1', Role: 'Head', SlaDays: 2, Mandatory: 'X' });
  });
});
