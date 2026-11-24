import { beforeEach, describe, expect, it, vi } from 'vitest';

const upload = vi.fn();
vi.mock('@/lib/documents', () => ({ uploadDocument: (i: unknown) => upload(i) }));

import { buildEmptyAttachments } from '@/components/cpe/logic';
import { categoryLabel, pendingUploads, uploadAll, uploadCategories } from '@/components/cpe/uploads';

const f = (n: string) => new File(['x'], n);

describe('CPE document upload chain', () => {
  beforeEach(() => upload.mockReset());

  it('uploads picked slots in order with category, title and note', async () => {
    upload.mockResolvedValue({});
    const att = buildEmptyAttachments(1);
    att.rfq[0].note = 'n1';
    att.general.push({ id: 'GEN1', label: 'Additional Document', title: 'Extra', note: '', fileName: 'g.pdf' });
    await uploadAll('CPE-1', att, { RFQ1: f('a.pdf'), TCC: f('t.pdf'), GEN1: f('g.pdf') });
    expect(upload.mock.calls.map((c) => c[0].category)).toEqual(['RFQ1', 'TCC', 'GEN']);
    expect(upload.mock.calls[0][0]).toMatchObject({ doctype: 'CPE', docid: 'CPE-1', title: 'RFQ 1', note: 'n1' });
    expect(upload.mock.calls[2][0].title).toBe('Extra');
  });

  it('stops at the first failure with the slot and SAP message; retry sends only the remaining files', async () => {
    const att = buildEmptyAttachments(1);
    const files = { RFQ1: f('a.pdf'), QUOTE1: f('q.pdf'), TCC: f('t.pdf') };
    const done = new Set<string>();
    upload.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('File type not allowed by SAP'));
    await expect(uploadAll('CPE-1', att, files, done)).rejects.toThrow('Upload failed for Quotation 1 (q.pdf): File type not allowed by SAP');
    expect([...done]).toEqual(['RFQ1']);
    expect(upload).toHaveBeenCalledTimes(2);
    upload.mockResolvedValue({});
    await uploadAll('CPE-1', att, files, done);
    expect(upload.mock.calls.slice(2).map((c) => c[0].category)).toEqual(['QUOTE1', 'TCC']);
    expect(pendingUploads(att, files, done)).toHaveLength(0);
  });

  it('category choices hide AMT_REV unless admin', () => {
    expect(uploadCategories(['GEN', 'AMT_REV'], false)).toEqual(['GEN']);
    expect(uploadCategories(['GEN', 'AMT_REV'], true)).toEqual(['GEN', 'AMT_REV']);
    expect(categoryLabel('QUOTE2')).toBe('Quotation 2');
  });
});
