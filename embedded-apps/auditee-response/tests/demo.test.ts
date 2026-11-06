import { beforeEach, describe, expect, it } from 'vitest';
import { demoService, resetDemo } from '@/lib/demo';

// The demo stands in for the hub backend + SAP: same rules as the contract "as built".
describe('demo service', () => {
  beforeEach(() => resetDemo());

  it('lists per track and FY', async () => {
    const audit = await demoService.list('audit', '');
    const mis = await demoService.list('mis', '');
    expect(audit.every((w) => w.track === 'audit')).toBe(true);
    expect(mis.map((w) => w.guid)).toEqual(['DEMO-MIS-3101', 'DEMO-MIS-2907']);
    expect((await demoService.list('audit', '2024')).map((w) => w.guid)).toEqual(['DEMO-WP-0512']);
  });

  it('submit needs a response on every one of my observations', async () => {
    await expect(demoService.submit('DEMO-WP-1001', [{ lineItem: '1', ownerLineItem: '1', text: 'x' }])).rejects.toThrow(/Missing: observation 2/);
    await expect(demoService.submit('DEMO-WP-1001', [{ lineItem: '9', ownerLineItem: '1', text: 'x' }])).rejects.toThrow(/not one of your observations/);
  });

  it('the workpaper moves only when the last assignee has submitted', async () => {
    const w = await demoService.submit('DEMO-WP-1001', [{ lineItem: '1', ownerLineItem: '1', text: 'a' }, { lineItem: '2', ownerLineItem: '2', text: 'b' }]);
    expect(w.status).toBe('Send to Auditee');
    expect(w.mySubmitted).toBe(true);
    expect(w.waitingFor).toEqual(['Anil Mehta']);
    const last = await demoService.submit('DEMO-WP-1003', [{ lineItem: '1', ownerLineItem: '1', text: 'done' }]);
    expect(last.status).toBe('Management Responded');
    expect(last.canRespond).toBe(false);
    expect(last.waitingFor).toEqual([]);
  });

  it('read only once responded or closed; files: delete own only', async () => {
    await expect(demoService.submit('DEMO-WP-0512', [])).rejects.toMatchObject({ status: 409 });
    await expect(demoService.remove('DEMO-WP-1001', 'Vendor duplicates list.xlsx')).rejects.toMatchObject({ status: 403 });
    expect((await demoService.remove('DEMO-WP-1001', 'FK08 change request.pdf')).length).toBe(1);
    await expect(demoService.upload('DEMO-WP-1001', { name: 'a.exe', mimeType: '', base64: 'eA==', size: 1 })).rejects.toMatchObject({ status: 415 });
  });
});
