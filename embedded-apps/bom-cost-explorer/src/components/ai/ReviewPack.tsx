'use client';
/** Monthly review pack: the latest AI review of each screen made in this tab, assembled into one text to copy or download. */
import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '../ui';
import { clearPack, packText, readPack, type PackItem } from '@/lib/ai/narrate';

export default function ReviewPack() {
  const [items, setItems] = useState<PackItem[]>(readPack());
  const text = packText(items);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = `Costing review ${new Date().toISOString().slice(0, 10)}.txt`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <h3 className="text-sm font-extrabold">Monthly review pack</h3>
      <p className="mb-2 text-xs text-muted">Press &quot;Explain with AI&quot; on the MIS, bridge, Sales, Margin, Cost breakup, Data quality and Freight screens; the latest review of each is collected here for one document.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setItems(readPack())}><RefreshCw size={13} /> Refresh</Button>
        <Button size="sm" disabled={!items.length} onClick={download}><Download size={13} /> Download as text</Button>
        <Button size="sm" variant="ghost" disabled={!items.length} onClick={() => { clearPack(); setItems([]); }}>Clear</Button>
        <span className="text-xs text-muted">{items.length ? `${items.length} review(s): ${items.map((i) => i.title.split(':')[0]).join(' · ')}` : 'No review made in this tab yet.'}</span>
      </div>
      {items.length > 0 && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken/30 p-3 text-xs">{text}</pre>}
    </div>
  );
}
