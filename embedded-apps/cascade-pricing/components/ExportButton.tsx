'use client';
import { useState } from 'react';
import { Button } from './ui';
import { exportFileName, exportRowsToExcel } from '@/lib/export';
import type { Column, Row } from '@/lib/types';

/** Excel export of a grid: displayed column labels as headers, file <tab>_<yyyymmdd>.xlsx. */
export default function ExportButton({ rows, columns, tab, disabled }: { rows: Row[]; columns: Column[]; tab: string; disabled?: boolean }) {
  const [working, setWorking] = useState(false);
  return (
    <Button disabled={disabled || working || !rows.length} aria-label={`Export ${tab} to Excel`}
      onClick={async () => { setWorking(true); try { await exportRowsToExcel(rows, columns, exportFileName(tab)); } finally { setWorking(false); } }}>
      {working ? 'Exporting...' : 'Export to Excel'}
    </Button>
  );
}
