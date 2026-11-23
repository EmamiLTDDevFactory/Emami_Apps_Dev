'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import AdminGuard from '../../../components/AdminGuard';
import Banner, { type BannerState } from '../../../components/Banner';
import { ConfirmDialog, Field, Section, Spinner, TableWrap, inputCls, td, th } from '../../../components/ui';
import { MAX_UPLOAD_BYTES, parseBlockedWorkbook, type BlockedUploadResult } from '../../../lib/blockedUpload';
import { addBlocked, listBlocked, padPernr, removeBlocked } from '../../../lib/mediclaim';
import type { BlockedEmployee } from '../../../lib/types';

function Blocked() {
  const [rows, setRows] = useState<BlockedEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<BlockedEmployee | null>(null);
  const [upload, setUpload] = useState<(BlockedUploadResult & { file: string }) | null>(null);
  const [progress, setProgress] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listBlocked());
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not load the list.' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBanner(null);
    if (!/^\d{1,8}$/.test(empId.trim())) return setBanner({ type: 'error', message: 'Enter a valid employee id (up to 8 digits).' });
    setBusy(true);
    try {
      await addBlocked(empId, name);
      setBanner({ type: 'success', message: 'Saved' });
      setEmpId('');
      setName('');
      await load();
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await removeBlocked(toDelete.EmpId);
      setBanner({ type: 'success', message: `Employee ${toDelete.EmpId} can apply again.` });
      await load();
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not remove.' });
    } finally {
      setToDelete(null);
      setBusy(false);
    }
  };

  const pick = async (file: File | undefined) => {
    setBanner(null);
    setUpload(null);
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) return setBanner({ type: 'error', message: 'Upload an Excel file (.xlsx).' });
    if (file.size > MAX_UPLOAD_BYTES) return setBanner({ type: 'error', message: 'The file is larger than 2 MB.' });
    try {
      const parsed = parseBlockedWorkbook(await file.arrayBuffer());
      if (!parsed.rows.length) return setBanner({ type: 'error', message: 'No employee ids found in column A of the first sheet.' });
      setUpload({ ...parsed, file: file.name });
    } catch {
      setBanner({ type: 'error', message: 'Could not read that file as an Excel workbook.' });
    }
  };

  const saveUpload = async () => {
    if (!upload) return;
    setBusy(true);
    const failed: string[] = [];
    let done = 0;
    for (const r of upload.rows) {
      setProgress(`Saving ${done + 1} of ${upload.rows.length}...`);
      try {
        await addBlocked(r.EmpId, r.Name);
        done += 1;
      } catch (e) {
        failed.push(`${r.EmpId}: ${e instanceof Error ? e.message : 'failed'}`);
        // A failure that is not about this row (service down, not authorised) will repeat for every row: stop.
        if (failed.length >= 3 && done === 0) break;
      }
    }
    setProgress('');
    setUpload(null);
    if (fileRef.current) fileRef.current.value = '';
    setBanner(
      failed.length
        ? { type: 'error', message: `Saved ${done} of ${upload.rows.length}. Not saved: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? ' ...' : ''}` }
        : { type: 'success', message: `Saved ${done} employee id${done === 1 ? '' : 's'}.` }
    );
    setBusy(false);
    await load();
  };

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Disable the employee codes</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}

      <Section title="Block an employee" note="Blocked employee ids cannot apply">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-[160px]">
            <Field label="Employee Id" required htmlFor="bId">
              <input id="bId" className={inputCls()} value={empId} inputMode="numeric" maxLength={8} onChange={(e) => setEmpId(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <div className="w-full max-w-[280px]">
            <Field label="Name" htmlFor="bName">
              <input id="bName" className={inputCls()} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <button type="button" onClick={() => void add()} disabled={busy} className="btn-primary !px-3 !py-2 text-[12.5px]">
            <Plus size={13} />
            Add
          </button>
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 text-[11.5px] font-semibold text-inkSoft">Or upload an Excel file: column A = employee id, column B = name (first sheet; a header row is skipped).</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={(e) => void pick(e.target.files?.[0])} className="text-[12px]" aria-label="Upload Excel file" disabled={busy} />
          {upload && (
            <div className="mt-3">
              <p className="mb-1.5 text-[12px] font-semibold text-ink">
                {upload.file}: {upload.rows.length} employee id{upload.rows.length === 1 ? '' : 's'} ready
                {upload.skipped.length > 0 && ` (rows skipped: ${upload.skipped.slice(0, 8).join(', ')}${upload.skipped.length > 8 ? ' ...' : ''})`}
              </p>
              <TableWrap>
                <table className="w-full">
                  <thead className="border-b border-border bg-cream"><tr><th className={th}>Employee Id</th><th className={th}>Name</th></tr></thead>
                  <tbody>
                    {upload.rows.slice(0, 10).map((r) => (
                      <tr key={r.EmpId} className="border-b border-border/60 last:border-0"><td className={td}>{r.EmpId}</td><td className={td}>{r.Name}</td></tr>
                    ))}
                    {upload.rows.length > 10 && <tr><td className={`${td} text-inkSoft`} colSpan={2}>... and {upload.rows.length - 10} more</td></tr>}
                  </tbody>
                </table>
              </TableWrap>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => void saveUpload()} disabled={busy} className="btn-primary !px-3 !py-1.5 text-[12.5px]">
                  <Upload size={13} />
                  Save all
                </button>
                <button type="button" onClick={() => { setUpload(null); if (fileRef.current) fileRef.current.value = ''; }} disabled={busy} className="btn-ghost !px-3 !py-1.5 text-[12.5px]">Discard</button>
                {progress && <span className="text-[12px] text-inkSoft">{progress}</span>}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Blocked employee ids" note={`${rows.length} blocked`}>
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-[12.5px] text-inkSoft">No employee ids are blocked.</p>
        ) : (
          <TableWrap>
            <table className="w-full">
              <thead className="border-b border-border bg-cream"><tr><th className={th}>Employee Id</th><th className={th}>Name</th><th className={th} /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.EmpId} className="border-b border-border/60 last:border-0">
                    <td className={td}>{r.EmpId}</td>
                    <td className={td}>{r.Name}</td>
                    <td className={`${td} text-right`}>
                      <button type="button" aria-label={`Unblock ${padPernr(r.EmpId)}`} onClick={() => setToDelete(r)} className="rounded-md p-1 text-inkSoft hover:bg-redBg hover:text-red"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Section>

      {toDelete && (
        <ConfirmDialog title="Unblock this employee?" message={`Employee ${toDelete.EmpId}${toDelete.Name ? ` (${toDelete.Name})` : ''} will be able to apply again.`}
          confirmLabel="Unblock" busy={busy} onConfirm={() => void remove()} onCancel={() => setToDelete(null)} />
      )}
    </div>
  );
}

export default function BlockedPage() {
  return (
    <AdminGuard maint>
      <Blocked />
    </AdminGuard>
  );
}
