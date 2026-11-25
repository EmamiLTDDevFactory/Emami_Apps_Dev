'use client';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { openDocument, saveDocument, type CapexDocument } from '@/lib/documents';

/** View (new tab) + Download for one saved document. SAP's message is shown when it refuses. */
export default function DocActions({ doc }: { doc: CapexDocument }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (f: (d: CapexDocument) => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await f(doc); } catch (e) { toast(e instanceof Error ? e.message : 'The document could not be opened.', 'error'); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex gap-1.5">
      <Button disabled={busy} onClick={() => go(openDocument)} aria-label={`View ${doc.Filename}`}>View</Button>
      <Button disabled={busy} onClick={() => go(saveDocument)} aria-label={`Download ${doc.Filename}`}>Download</Button>
    </span>
  );
}
