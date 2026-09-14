'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Download, Loader2, RefreshCw, X,
} from 'lucide-react';
import { uploadServicePoFile, PoUploadError } from '../../lib/sapClient';
import { getHubEmail } from '../../lib/hubEmailLogin';
import { exportFailedRowsToCsv } from '../../lib/exportCsv';
import { stripLeadingZeros, formatEbelp, formatNumber } from '../../lib/formatters';
import type { PoUploadResult, PoUploadResultRow } from '../../types/poUpload';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// TODO: point this at the hosted .xlsx template once Basis/SharePoint gives us a stable URL.
const TEMPLATE_URL: string | null = null;

type ErrorBanner = { kind: 'timeout' | 'network' | 'sap'; message: string } | null;

/** Reads a browser File as base64 via FileReader's data URL form, stripping the
 * "data:<mime>;base64," prefix — the backend wants the raw base64 payload, no data-URI prefix
 * (same helper shape as market-rate's master-data upload screen). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function groupByEbeln(rows: PoUploadResultRow[]): [string, PoUploadResultRow[]][] {
  const map = new Map<string, PoUploadResultRow[]>();
  for (const row of rows) {
    const key = row.ebeln || '—';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  // Real PO groups first (in the order they first appeared), rows that never became a PO last.
  return Array.from(map.entries()).sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : 0));
}

// Tailwind's JIT scans source for literal class strings, so each status gets its own fully
// literal class string here rather than an interpolated one — a `border-${tone}/30` template
// would never be generated.
const STATUS_BANNER_CLASSES: Record<PoUploadResult['status'], string> = {
  S: 'border-green/30 bg-greenBg text-green',
  P: 'border-amber/30 bg-amberBg text-amber',
  E: 'border-red/30 bg-redBg text-red',
};

function StatusBanner({ result }: { result: PoUploadResult }) {
  const Icon = result.status === 'S' ? CheckCircle2 : result.status === 'P' ? AlertTriangle : XCircle;
  const text = result.status === 'S'
    ? `All ${result.totalRows} row${result.totalRows === 1 ? '' : 's'} posted`
    : result.status === 'P'
      ? `${result.successCnt} posted, ${result.errorCnt} failed`
      : (result.message || 'Upload failed — no rows were posted.');

  return (
    <div className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${STATUS_BANNER_CLASSES[result.status]}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span className="flex-1">{text}</span>
    </div>
  );
}

export default function UploadPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<PoUploadResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<ErrorBanner>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEmail(getHubEmail());
  }, []);

  const groups = useMemo(() => (result ? groupByEbeln(result.rows) : []), [result]);

  const handlePick = (picked: File) => {
    setResult(null);
    setErrorBanner(null);
    if (!picked.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setFileError('Only .xlsx files are accepted.');
      return;
    }
    if (picked.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setFileError(`File is ${(picked.size / (1024 * 1024)).toFixed(1)} MB — the limit is 5 MB.`);
      return;
    }
    setFileError(null);
    setFile(picked);
  };

  const handleUpload = async () => {
    if (!file || !email) return;
    setUploading(true);
    setProgress(0);
    setErrorBanner(null);
    setResult(null);
    try {
      const base64 = await readFileAsBase64(file);
      const res = await uploadServicePoFile(email, file.name, base64, setProgress);
      setResult(res);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      if (err instanceof PoUploadError) {
        setErrorBanner({ kind: err.kind, message: err.message });
      } else {
        setErrorBanner({ kind: 'sap', message: err instanceof Error ? err.message : 'Upload failed.' });
      }
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    if (TEMPLATE_URL) {
      window.open(TEMPLATE_URL, '_blank');
      return;
    }
    setTemplateNotice("Template isn't hosted yet — check back soon.");
  };

  const handleExportFailedRows = () => {
    if (!result) return;
    exportFailedRowsToCsv(
      result.rows.filter((r) => r.type === 'E').map((r) => ({ rowno: r.rowno, message: r.message })),
      'PO_Upload_Failed_Rows'
    );
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-ink">Bulk PO Upload</h2>
          <p className="text-[12.5px] text-inkSoft">Upload an .xlsx file to create Service POs in bulk.</p>
        </div>
        <div className="flex items-center gap-2 text-[12.5px]">
          <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-1 font-semibold text-rust hover:underline">
            <Download size={13} /> Download template
          </button>
          {templateNotice && <span className="text-inkSoft">{templateNotice}</span>}
        </div>
      </div>

      <div className="card p-5">
        <label
          className={`flex items-center gap-2 rounded-xl border border-dashed px-4 py-3.5 cursor-pointer transition-colors ${
            file ? 'border-rust bg-rust/5' : 'border-border bg-appBg hover:border-rust/40'
          }`}
        >
          <FileSpreadsheet size={18} className="text-rust shrink-0" />
          <span className={`text-sm ${file ? 'font-bold text-ink' : 'text-inkSoft'}`}>
            {file ? file.name : 'Choose an .xlsx file'}
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) handlePick(picked);
            }}
            className="hidden"
          />
        </label>

        {fileError && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-red">
            <XCircle size={13} /> {fileError}
          </p>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading || !email}
          className="btn-primary mt-3"
        >
          {uploading ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Uploading{progress > 0 ? ` ${progress}%` : '…'}
            </>
          ) : (
            <>
              <UploadCloud size={15} />
              Upload
            </>
          )}
        </button>

        {uploading && (
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-rust transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        {errorBanner && (
          <div className={`mt-3 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            errorBanner.kind === 'timeout' ? 'border-amber/30 bg-amberBg text-amber' : 'border-red/30 bg-redBg text-red'
          }`}>
            {errorBanner.kind === 'timeout' ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{errorBanner.message}</span>
            {errorBanner.kind !== 'timeout' && (
              <button onClick={handleUpload} className="btn-ghost !py-1 !px-2.5 text-xs shrink-0">
                <RefreshCw size={13} /> Retry
              </button>
            )}
            <button onClick={() => setErrorBanner(null)} className="shrink-0 text-inkSoft hover:text-ink">
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {result && (
        <div className="mt-5">
          <StatusBanner result={result} />

          {result.errorCnt > 0 && (
            <div className="mb-3 flex justify-end">
              <button onClick={handleExportFailedRows} className="btn-ghost">
                <Download size={15} /> Export failed rows
              </button>
            </div>
          )}

          {result.rows.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-inkSoft">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">PO</th>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([ebeln, rows]) => (
                    <React.Fragment key={ebeln}>
                      <tr className="bg-appBg/60">
                        <td colSpan={8} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-inkSoft">
                          {ebeln === '—'
                            ? `Not created (${rows.length})`
                            : `PO ${ebeln} (${rows.length} item${rows.length === 1 ? '' : 's'})`}
                        </td>
                      </tr>
                      {rows.map((row, i) => (
                        <React.Fragment key={`${ebeln}-${row.rowno}-${i}`}>
                          <tr className={row.type === 'E' ? 'bg-redBg/60' : 'bg-greenBg/40'}>
                            <td className="px-3 py-2 font-semibold text-ink">{row.rowno}</td>
                            <td className="px-3 py-2 text-ink">{stripLeadingZeros(row.lifnr) || '—'}</td>
                            <td className="px-3 py-2 text-ink">{row.txz01 || '—'}</td>
                            <td className="px-3 py-2 text-right text-ink">{formatNumber(row.menge) || '—'}</td>
                            <td className="px-3 py-2 text-right text-ink">{formatNumber(row.grPrice) || '—'}</td>
                            <td className="px-3 py-2 text-ink">{row.ebeln || '—'}</td>
                            <td className="px-3 py-2 text-ink">{formatEbelp(row.ebelp)}</td>
                            <td className="px-3 py-2">
                              <span className={`pill ${row.type === 'E' ? 'bg-redBg text-red' : 'bg-greenBg text-green'}`}>
                                {row.type === 'E' ? 'Failed' : 'Posted'}
                              </span>
                            </td>
                          </tr>
                          {row.type === 'E' && (
                            <tr className="bg-redBg/60">
                              <td />
                              <td colSpan={7} className="px-3 pb-2.5 text-[12.5px] text-red">{row.message}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
