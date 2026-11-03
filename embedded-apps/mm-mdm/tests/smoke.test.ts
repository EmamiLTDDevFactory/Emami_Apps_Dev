import { beforeEach, describe, expect, it } from 'vitest';
import { MockService, resetDemoStore } from '@/lib/demo/service';
import { ServiceError } from '@/lib/service';
import type { RequestData } from '@/lib/types';

// The 15 API checks of the original smoke script, run against the demo service in memory (no server, no SAP).
const svc = new MockService();
const as = (user: string) => ({ user });
const start = { materialType: 'FERT', industrySector: 'F', description: 'SMOKE TEST ITEM', views: ['MARA_BASIC1', 'MARC_GEN'], draft: false };
const status = async (p: Promise<unknown>) => { try { await p; return 200; } catch (e) { if (e instanceof ServiceError) return e.status; throw e; } };

beforeEach(() => resetDemoStore());

describe('demo service smoke', () => {
  it('session and list', async () => {
    expect((await svc.session(as('initiator'))).roles).toContain('initiator');
    expect((await svc.listRequests(as('initiator'), { scope: 'all' })).length).toBeGreaterThanOrEqual(5);
  });

  it('start, validate, submit with errors, save draft, delete draft', async () => {
    const r = await svc.startRequest(as('initiator'), start);
    expect(r.header.status).toBe('01');
    const id = r.header.transId;
    const data: RequestData = r.data;
    expect((await svc.validate(as('initiator'), id, data)).length).toBeGreaterThan(0);
    data.single.Material.NTGEW = '5'; data.single.Material.BRGEW = '2';
    expect((await svc.validate(as('initiator'), id, data)).some((m) => m.code === 'E027' && m.target === 'Material/NTGEW')).toBe(true);
    await expect(svc.submit(as('initiator'), id, data)).rejects.toMatchObject({ status: 422 });
    expect(await status(svc.deleteDraft(as('initiator'), id))).toBe(403); // status 01 is not a draft
    expect((await svc.saveRequest(as('initiator'), id, data)).request.header.status).toBe('00');
    await svc.deleteDraft(as('initiator'), id);
    expect(await status(svc.getRequest(as('initiator'), id))).toBe(404);
  });

  it('reviewer inbox, approval rights and level change', async () => {
    const inbox = await svc.listRequests(as('reviewer'), { scope: 'inbox' });
    const wi = inbox.find((x) => x.status === '02');
    expect(wi).toBeTruthy();
    expect(await status(svc.act(as('initiator'), wi!.transId, 'approve', {}))).toBe(403);
    const a = await svc.act(as('reviewer'), wi!.transId, 'approve', { comment: 'ok' });
    expect(a.request.level).toBe('L2');
    expect(a.request.header.status).toBe('02');
  });

  it('field control, description', async () => {
    expect(Object.keys(await svc.fieldControl(as('initiator'), 'FERT', 'L0')).length).toBeGreaterThan(10);
    const d = await svc.buildDescription(as('initiator'), { description: 'a'.repeat(50) });
    expect(d.text.length).toBe(40);
    expect(d.truncated).toBe(true);
  });
});
