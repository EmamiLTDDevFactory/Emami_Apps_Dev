'use client';
/**
 * "Spec" and "Artwork" buttons of a material: shown only to people with the documents role, and only when SAP has that document
 * (latest SPEC_ / ARTWORK_ PDF of an RM / PM / FG material). Anything else (no role, no document, SAP error) shows nothing.
 */
import { useEffect, useState } from 'react';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { useMatDocAccess } from '@/lib/matdocs/access';
import { latestDocs } from '@/lib/matdocs/service';
import type { MatDoc, MatDocs } from '@/lib/matdocs/model';
import { cx } from '../ui';
import DocViewer from './DocViewer';

export default function DocButtons({ matnr, compact = false }: { matnr: string; /** small icon-only chips for table rows */ compact?: boolean }) {
  const ok = useMatDocAccess();
  const [docs, setDocs] = useState<MatDocs>({});
  const [open, setOpen] = useState<MatDoc | null>(null);
  useEffect(() => {
    let live = true; setDocs({});
    if (ok && matnr) void latestDocs(matnr).then((d) => { if (live) setDocs(d); });
    return () => { live = false; };
  }, [ok, matnr]);
  if (!ok || (!docs.spec && !docs.art)) return null;
  const btn = compact
    ? 'inline-flex h-5 items-center gap-0.5 rounded-full border border-line bg-panel px-1.5 text-[10px] font-bold text-ink hover:border-accent hover:bg-accent/10'
    : 'inline-flex h-7 items-center gap-1 rounded-full border border-line bg-panel px-2.5 text-2xs font-bold text-ink transition hover:border-accent hover:bg-accent/10';
  const b = (d: MatDoc | undefined, label: string, Icon: typeof FileText) => d && (
    <button type="button" className={btn} title={`${label}: ${d.title}${d.created ? ` (attached ${d.created})` : ''}${d.versions > 1 ? `, ${d.versions} versions` : ''}`} aria-label={`${label} of ${d.matnr}`}
      onClick={(e) => { e.stopPropagation(); setOpen(d); }}><Icon size={compact ? 10 : 13} aria-hidden /> {label}</button>
  );
  return (
    <span className={cx('inline-flex items-center', compact ? 'gap-1 align-middle' : 'gap-1.5')} onClick={(e) => e.stopPropagation()}>
      {b(docs.spec, compact ? 'Spec' : 'Specification', FileText)}
      {b(docs.art, 'Artwork', ImageIcon)}
      {open && <DocViewer doc={open} onClose={() => setOpen(null)} />}
    </span>
  );
}
