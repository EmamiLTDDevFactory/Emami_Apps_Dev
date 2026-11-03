'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/i18n';
import { RequestEditor } from '@/components/RequestEditor';
import type { RequestView } from '@/lib/types';

// A static export cannot have a dynamic [transId] segment: the request is addressed as /requests/view/?id=<TransId>.
function RequestPage() {
  const t = useT();
  const transId = useSearchParams().get('id') ?? '';
  const [req, setReq] = useState<RequestView | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!transId) { setErr(t('editor.noneSelected')); return; }
    setReq(null); setErr('');
    api.get(transId).then(setReq).catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transId]);
  if (err) return <p className="notice" role="alert">{err}</p>;
  if (!req) return <p className="muted" role="status">{t('editor.loading')}</p>;
  return <RequestEditor key={req.header.transId} initial={req} />;
}

export default function Page() {
  return <Suspense fallback={<p className="muted" role="status">…</p>}><RequestPage /></Suspense>;
}
