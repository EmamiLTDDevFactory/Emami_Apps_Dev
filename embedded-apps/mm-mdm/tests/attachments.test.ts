import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ALLOWED_EXTENSIONS, DEMO_MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES, base64Size, base64ToBytes, bytesToBase64, checkFile, extensionOf, fileProblemMessage, fmtSize } from '@/lib/attachments';
import { MockService, resetDemoStore } from '@/lib/demo/service';
import { ServiceError } from '@/lib/service';

describe('attachment helpers', () => {
  it('checks name, size and type', () => {
    expect(checkFile('spec.pdf', 100)).toBeNull();
    expect(checkFile('SPEC.PDF', 100)).toBeNull();
    expect(checkFile('', 100)?.kind).toBe('name');
    expect(checkFile('a/b.pdf', 100)?.kind).toBe('name');
    expect(checkFile('x.pdf', 0)?.kind).toBe('empty');
    expect(checkFile('x.pdf', MAX_UPLOAD_BYTES + 1)?.kind).toBe('tooLarge');
    expect(checkFile('x.pdf', DEMO_MAX_UPLOAD_BYTES + 1, DEMO_MAX_UPLOAD_BYTES)?.kind).toBe('tooLarge');
    expect(checkFile('run.exe', 100)?.kind).toBe('type');
    expect(checkFile('noext', 100)?.kind).toBe('type');
    for (const e of ALLOWED_EXTENSIONS) expect(checkFile(`f.${e}`, 1)).toBeNull();
  });
  it('explains the problem and formats sizes', () => {
    expect(fileProblemMessage({ kind: 'tooLarge', limit: 1024 * 1024 })).toContain('1.0 MB');
    expect(fileProblemMessage({ kind: 'type' })).toContain('pdf');
    expect(fmtSize(500)).toBe('500 B');
    expect(fmtSize(2048)).toBe('2.0 KB');
    expect(fmtSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(extensionOf('a.b.PDF')).toBe('pdf');
  });
  it('base64 round trip keeps the bytes and the size', () => {
    const bytes = new Uint8Array(70000).map((_, i) => i % 251);
    const b64 = bytesToBase64(bytes);
    expect(base64Size(b64)).toBe(bytes.length);
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    expect(base64Size(bytesToBase64(new Uint8Array([1])))).toBe(1);
  });
});

describe('demo attachments and comments', () => {
  const svc = new MockService();
  const as = (user: string) => ({ user });
  beforeEach(() => resetDemoStore());
  const file = (name = 'spec.pdf', n = 10) => ({ fileName: name, mimeType: 'application/pdf', base64: bytesToBase64(new Uint8Array(n).fill(65)) });
  const draftId = async () => (await svc.startRequest(as('initiator'), { materialType: 'FERT', industrySector: 'F', description: 'X', views: ['MARA_BASIC1'], draft: true })).header.transId;

  it('the allowed flags decide who may attach and comment', async () => {
    const id = await draftId();
    expect((await svc.getRequest(as('initiator'), id)).allowed).toMatchObject({ attach: true, comment: true });
    expect((await svc.getRequest(as('reviewer'), id)).allowed).toMatchObject({ attach: false, comment: false });
    await expect(svc.addAttachment(as('reviewer'), id, file())).rejects.toMatchObject({ status: 403 });
    await expect(svc.addComment(as('reviewer'), id, 'hi')).rejects.toMatchObject({ status: 403 });
  });
  it('upload, list, download, delete; SAP-side fields are set by the service, not sent', async () => {
    const id = await draftId();
    const a = await svc.addAttachment(as('initiator'), id, file('plan.pdf', 12));
    expect(a).toMatchObject({ fileName: 'plan.pdf', size: 12, uploadedBy: 'initiator', level: 'L0' });
    expect((await svc.listAttachments(as('reviewer'), id)).map((x) => x.attachId)).toEqual([a.attachId]);
    expect(base64Size((await svc.readAttachment(as('reviewer'), id, a.attachId)).base64)).toBe(12);
    await svc.deleteAttachment(as('initiator'), id, a.attachId);
    expect(await svc.listAttachments(as('initiator'), id)).toEqual([]);
    await expect(svc.deleteAttachment(as('initiator'), id, a.attachId)).rejects.toMatchObject({ status: 404 });
  });
  it('refuses a wrong type and an oversized file with a message', async () => {
    const id = await draftId();
    const e1 = await svc.addAttachment(as('initiator'), id, file('run.exe')).catch((e: ServiceError) => e);
    expect(e1).toBeInstanceOf(ServiceError);
    expect((e1 as ServiceError).status).toBe(422);
    expect((e1 as ServiceError).messages[0].message).toContain('not allowed');
    await expect(svc.addAttachment(as('initiator'), id, file('big.pdf', DEMO_MAX_UPLOAD_BYTES + 1))).rejects.toMatchObject({ status: 422 });
  });
  it('comments: thread in order, empty and too long refused', async () => {
    const id = await draftId();
    await svc.addComment(as('initiator'), id, '  first  ');
    await svc.addComment(as('initiator'), id, 'second');
    const list = await svc.listComments(as('reviewer'), id);
    expect(list.map((c) => c.text)).toEqual(['first', 'second']);
    expect(list[0]).toMatchObject({ user: 'initiator', level: 'L0' });
    await expect(svc.addComment(as('initiator'), id, '   ')).rejects.toMatchObject({ status: 422 });
    await expect(svc.addComment(as('initiator'), id, 'x'.repeat(1001))).rejects.toMatchObject({ status: 422 });
  });
});

describe('api adapter', () => {
  beforeEach(() => { resetDemoStore(); vi.resetModules(); });
  it('demo: ServiceError becomes ApiError with status and all messages', async () => {
    const { api, ApiError } = await import('@/lib/api');
    const mine = (await api.list({ scope: 'mine' })).find((r) => r.status === '00');
    const bad = await api.uploadAttachment(mine!.transId, new File([new Uint8Array(3)], 'run.exe')).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(ApiError);
    expect((bad as InstanceType<typeof ApiError>).status).toBe(422);
    expect((bad as InstanceType<typeof ApiError>).messages[0].message).toContain('not allowed');
    const missing = await api.get('9999999999').catch((e: unknown) => e);
    expect((missing as InstanceType<typeof ApiError>).status).toBe(404);
  });
  it('demo: upload and download round trip through the adapter', async () => {
    const { api } = await import('@/lib/api');
    const mine = (await api.list({ scope: 'mine' })).find((r) => r.status === '00');
    expect(mine).toBeTruthy();
    const a = await api.uploadAttachment(mine!.transId, new File([new Uint8Array([1, 2, 3])], 'n.pdf', { type: 'application/pdf' }));
    expect(a.size).toBe(3);
    const blob = await api.downloadAttachment(mine!.transId, a.attachId);
    expect(blob.size).toBe(3);
    expect((await api.comments(mine!.transId))).toEqual([]);
    expect((await api.addComment(mine!.transId, 'ok')).text).toBe('ok');
  });
  it('live: the file travels as raw bytes with Slug, the JSON type is hidden, the hub token is sent, errors keep all messages', async () => {
    vi.stubEnv('NEXT_PUBLIC_MM_MODE', 'live');
    vi.stubEnv('NEXT_PUBLIC_MM_API_BASE', 'https://api.test/me/mm-mdm');
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('window', { localStorage: { getItem: () => 'hub-token' }, location: { hostname: 'x' } });
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (String(url).endsWith('/comments')) return new Response(JSON.stringify({ error: 'Rejected', messages: [{ code: 'E1', message: 'One', severity: 'E' }, { code: 'E2', message: 'Two', severity: 'E' }] }), { status: 422 });
      return new Response(JSON.stringify({ attachId: 'A1', fileName: 'x.pdf', mimeType: '', size: 3, uploadedBy: '', uploadedAt: '', level: '' }), { status: 201 });
    });
    try {
      const { api, ApiError } = await import('@/lib/api');
      expect(api.mode).toBe('live');
      await api.uploadAttachment('0000000001', new File([new Uint8Array(3)], 'My file.pdf', { type: 'application/json' }));
      const h = calls[0].init.headers as Record<string, string>;
      expect(calls[0].url).toBe('https://api.test/me/mm-mdm/requests/0000000001/attachments');
      expect(h.Slug).toBe(encodeURIComponent('My file.pdf'));
      expect(h['Content-Type']).toBe('application/octet-stream');
      expect(h.Authorization).toBe('Bearer hub-token');
      const err = await api.addComment('0000000001', 'x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).messages.map((m) => m.code)).toEqual(['E1', 'E2']);
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });
});
