'use client';
import { AlertTriangle } from 'lucide-react';
import { integrityMessage, type RatesIntegrity } from '@/lib/rates/integrity';

/** One amber banner when SAP returned fewer rate options than it counted (the tab still renders). */
export default function IntegrityBanner({ integrity, className }: { integrity: RatesIntegrity | null; className?: string }) {
  const msg = integrity ? integrityMessage(integrity) : '';
  if (!msg) return null;
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/[0.08] px-3 py-2 text-xs ${className ?? ''}`}>
      <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
      <span>{msg}{integrity?.allEmpty ? ' SAP sent no option rows at all.' : ''}</span>
    </div>
  );
}
