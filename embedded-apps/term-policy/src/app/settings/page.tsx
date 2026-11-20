'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import AdminGuard from '../../components/AdminGuard';
import Banner, { type BannerState } from '../../components/Banner';
import { Field, Section, Spinner, inputCls } from '../../components/ui';
import { blankRow, maintApi } from '../../lib/maint';

const MAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const fromSap = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6)}` : '');

function Settings() {
  const [date, setDate] = useState('');
  const [mail, setMail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = (await maintApi.list('DATE')).find((r) => r.key1 === '2');
      setDate(fromSap(row?.val1 ?? ''));
      setMail(row?.val2 ?? '');
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not load.' });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setBanner(null);
    if (!date) return setBanner({ type: 'error', message: 'Enter the cut-off date.' });
    if (mail.trim() && !MAIL.test(mail.trim())) return setBanner({ type: 'error', message: 'Invalid Mail ID.' });
    setBusy(true);
    try {
      await maintApi.apply('DATE', 'SAVE', [{ ...blankRow(), key1: '2', val1: date, val2: mail.trim().toLowerCase() }]);
      await load();
      setBanner({ type: 'success', message: 'Saved.' });
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Cut-off date &amp; HR mail</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <Section title="Term Life settings" note="SAP table ZMEDI_DATE, row 2. After the cut-off date only editors, admins and employees in their first 30 days can apply or change. The HR mail address receives the request summary.">
        {loading ? (
          <Spinner />
        ) : (
          <>
            <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Cut-off date" required htmlFor="co">
                <input id="co" type="date" className={inputCls()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="HR mail address" htmlFor="hm">
                <input id="hm" type="email" className={inputCls()} value={mail} maxLength={241} onChange={(e) => setMail(e.target.value)} />
              </Field>
            </div>
            <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary mt-3 !px-4 !py-2 text-[12.5px]">
              <Save size={14} /> {busy ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AdminGuard>
      <Settings />
    </AdminGuard>
  );
}
