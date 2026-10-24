'use client';
import { useRef } from 'react';
import { Button } from './ui';
import { RATE_FILE_KEYS, SIM_FILE_KEYS } from '@/lib/columns';
import type { Row } from '@/lib/types';

export interface FileUploadProps {
  id: string;
  label: string;
  disabled?: boolean;
  /** Which file: the rate file or the simulation file (lib/excel.ts, loaded only when a file is picked). */
  kind: 'rate' | 'sim';
  onRows: (rows: Row[]) => void;
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

/** .xlsx picker that parses in the browser; parse errors go to the status bar. */
export default function FileUpload({ id, label, disabled, kind, onRows, onError, templateName }: FileUploadProps) {
  const input = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      if (!/\.xlsx$/i.test(file.name)) { onError('Only .xlsx files are accepted.'); return; }
      const excel = await import('@/lib/excel');
      const data = await file.arrayBuffer();
      onRows(kind === 'rate' ? excel.parseRateFile(data) : excel.parseSimulationFile(data));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'The file could not be parsed.');
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  async function downloadTemplate() {
    const { templateWorkbook } = await import('@/lib/excel');
    // Header row only (the file layout); rows start in row 2.
    save(templateWorkbook(kind === 'rate' ? [...RATE_FILE_KEYS] : [...SIM_FILE_KEYS], []), templateName);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} id={id} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={disabled} onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button variant="primary" disabled={disabled} onClick={() => input.current?.click()} aria-controls={id}>{label}</Button>
      <Button disabled={disabled} onClick={() => void downloadTemplate()}>Download template</Button>
    </div>
  );
}
