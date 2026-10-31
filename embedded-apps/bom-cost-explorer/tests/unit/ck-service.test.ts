import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sap/client', async (orig) => ({ ...(await orig<typeof import('@/lib/sap/client')>()), sapGetCollection: vi.fn() }));
import { sapGetCollection } from '@/lib/sap/client';
import { fetchCk } from '@/lib/ck/service';

const get = vi.mocked(sapGetCollection);
beforeEach(() => get.mockReset());

describe('fetchCk (inline fixtures, no mock server)', () => {
  it('reads the right set with the built filter and NO time limit', async () => {
    get.mockResolvedValue({ rows: [], count: null, messages: [], ms: 5, sapMessageHeader: false, status: 200 });
    const ctl = new AbortController();
    await fetchCk('LIST', { matnr: 'M', werks: 'UN13' }, { signal: ctl.signal });
    expect(get).toHaveBeenCalledTimes(1);
    const [set, params, opts] = get.mock.calls[0];
    expect(set).toBe('CkListSet');
    expect(params).toEqual({ $filter: "Matnr eq 'M' and Werks eq 'UN13'" });
    expect(opts).toMatchObject({ noTimeout: true, signal: ctl.signal });
    expect(opts).not.toHaveProperty('timeoutMs');
  });
  it('an empty amount stays "" (n/a), a real one is canonical, flags and dates are typed', async () => {
    get.mockResolvedValue({
      rows: [{ Matnr: 'M', Total: '', StdPrice: '12.5000', CurStd: 'X', Kadky: '/Date(1790812800000)/', Kalnr: ' 1 ', Losgr: '1000.000' }],
      count: null, messages: [], ms: 1, sapMessageHeader: false, status: 200,
    });
    const r = await fetchCk('LIST', { matnr: 'M', werks: 'UN13' });
    expect(r.rows[0].Total).toBe('');
    expect(r.rows[0].StdPrice).toBe('12.5');
    expect(r.rows[0].CurStd).toBe(true);
    expect(r.rows[0].Kadky).toBe('2026-10-01');
    expect(r.rows[0].Kalnr).toBe('1');
    expect(r.rows[0].Losgr).toBe('1000');
  });
  it('the header Msg becomes a SAP warning, not a failure', async () => {
    get.mockResolvedValue({ rows: [{ Matnr: 'M', Msg: 'Standard price differs from the cost estimate' }], count: null, messages: [], ms: 1, sapMessageHeader: false, status: 200 });
    const r = await fetchCk('HEADER', { matnr: 'M', werks: 'UN13' });
    expect(r.messages).toEqual([{ code: '', message: 'Standard price differs from the cost estimate', severity: 'warning' }]);
  });
  it('a missing plant is refused before any request', async () => {
    await expect(fetchCk('LIST', { matnr: 'M' })).rejects.toThrow(/plant/);
    expect(get).not.toHaveBeenCalled();
  });
});
