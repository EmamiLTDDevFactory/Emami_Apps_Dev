'use client';
import { useRef, useState } from 'react';
import { Button } from './ui';
import { RATE_COLUMNS, SIM_INPUT_COLUMNS } from '@/lib/columns';
import { sampleRateRows, sampleSimRows } from '@/lib/mock';
import type { Row } from '@/lib/types';

export interface FileUploadProps {
  id: string;
  label: string;
  disabled?: boolean;
  /** Which layout: the rate file or the simulation file (lib/excel.ts, loaded only when needed). */
  kind: 'rate' | 'sim';
  onRows: (rows: Row[], fileName: string) => void;
  onError: (message: string) => void;
  templateName: string;
}

function save(data: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** .xlsx picker that parses in the browser; lists the rows it could not read. */
export default function FileUpload({ id, label, disabled, kind, onRows, onError, templateName }: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setErrors([]);
    if (!/\.xlsx$/i.test(file.name)) {
      setInfo('');
      onError('Only .xlsx files are accepted.');
      return;
    }
    const excel = await import('@/lib/excel');
    try {
      const data = await file.arrayBuffer();
      const res = kind === 'rate' ? excel.parseRateFile(data) : excel.parseSimulationFile(data);
      setErrors(res.errors);
      setInfo(`${file.name}: ${res.rows.length} row(s) loaded${res.errors.length ? `, ${res.errors.length} skipped` : ''}`);
      if (!res.rows.length) onError(res.errors.length ? 'No valid rows in the file. See the list below.' : 'The file has no data rows (data starts in row 2).');
      onRows(res.rows, file.name);
    } catch (e) {
      setInfo('');
      onError(e instanceof excel.ExcelParseError ? e.message : 'The file could not be parsed.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  async function downloadTemplate() {
    const { templateWorkbook } = await import('@/lib/excel');
    save(kind === 'rate' ? templateWorkbook(RATE_COLUMNS, sampleRateRows()) : templateWorkbook(SIM_INPUT_COLUMNS, sampleSimRows()), templateName);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} id={id} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={disabled} onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button variant="primary" disabled={disabled} onClick={() => input.current?.click()} aria-controls={id}>{label}</Button>
      <Button disabled={disabled} onClick={() => void downloadTemplate()}>Download template</Button>
      {info && <span className="text-xs text-sap-muted" role="status">{info}</span>}
      {errors.length > 0 && (
        <details className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <summary className="cursor-pointer font-semibold">{errors.length} row(s) could not be read</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul>
          {errors.length > 50 && <p className="mt-1">… and {errors.length - 50} more.</p>}
        </details>
      )}
    </div>
  );
}
