'use client';
import { useState } from 'react';
import { Button, useToast } from '@/components/ui';
import { openDocument, removeDocument, saveDocument, type CapexDocument } from '@/lib/documents';

/** View (new tab) + Download for one saved document. SAP's message is shown when it refuses. */
export default function DocActions({ doc, onRemoved }: { doc: CapexDocument; onRemoved?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const go = async (f: (d: CapexDocument) => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await f(doc); } catch (e) { toast(e instanceof Error ? e.message : 'The document could not be opened.', 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy || !window.confirm(`Remove ${doc.Filename}?`)) return;
    setBusy(true);
    try { await removeDocument(doc); toast('Attachment removed.', 'success'); onRemoved?.(); }
    catch (e) { toast(e instanceof Error ? e.message : 'The attachment could not be removed.', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <span className="inline-flex gap-1.5">
      <Button disabled={busy} onClick={() => go(openDocument)} aria-label={`View ${doc.Filename}`}>View</Button>
      <Button disabled={busy} onClick={() => go(saveDocument)} aria-label={`Download ${doc.Filename}`}>Download</Button>
      {onRemoved && <Button disabled={busy} onClick={remove} aria-label={`Remove ${doc.Filename}`}>Remove</Button>}
    </span>
  );
}
