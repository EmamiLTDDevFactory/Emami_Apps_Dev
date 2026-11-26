import { describe, it, expect } from 'vitest';
import { notificationPath } from '../lib/notifyRoute';

describe('notification target', () => {
  it('maps the Fiori routes SAP sends', () => {
    expect(notificationPath({ Route: 'budgetDetail', ParamName: 'budgetId', ParamValue: 'B-2026-008' })).toBe('/budget/detail/?id=B-2026-008');
    expect(notificationPath({ Route: 'approvalDetail', ParamName: 'cpeId', ParamValue: 'CPE-2026-0044' })).toBe('/approvals/detail/?type=CPE&id=CPE-2026-0044');
    expect(notificationPath({ Route: 'cpeDetail', ParamValue: 'CPE-1' })).toBe('/cpe/detail/?id=CPE-1');
    expect(notificationPath({ Route: 'evaluation', ParamValue: 'CPE-1' })).toBe('/evaluation/?id=CPE-1');
    expect(notificationPath({ Route: 'icDetail', ParamValue: 'IC-1' })).toBe('/ic/detail/?id=IC-1');
  });
  it('falls back to the document, then the dashboard', () => {
    expect(notificationPath({ Route: 'somethingNew', Doctype: 'CPE', Docid: 'CPE-9' })).toBe('/cpe/detail/?id=CPE-9');
    expect(notificationPath({ Route: '', Doctype: 'BUD', ParamValue: 'B 1' })).toBe('/budget/detail/?id=B%201');
    expect(notificationPath({ Route: 'x' })).toBe('/');
  });
  it('keeps a real path', () => expect(notificationPath({ Route: '/cpe/' })).toBe('/cpe/'));
});
