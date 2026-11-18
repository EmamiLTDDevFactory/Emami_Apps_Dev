'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import AdminGuard from '../../../components/AdminGuard';
import Banner, { type BannerState } from '../../../components/Banner';
import { Field, Info, Section, grid, inputCls } from '../../../components/ui';
import { fmtDate } from '../../../lib/format';
import { setCutOff } from '../../../lib/mediclaim';
import { MAIL_REGEX } from '../../../lib/rules';

function CutOff() {
  const { ctx, refresh } = useApp();
  const [date, setDate] = useState(ctx?.CutOffDate ?? '');
  const [mail, setMail] = useState(ctx?.InsurerMail ?? '');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);

  const save = async () => {
    setBanner(null);
    if (!date) return setBanner({ type: 'error', message: 'Enter the cut-off date.' });
    if (mail.trim() && !MAIL_REGEX.test(mail.trim())) return setBanner({ type: 'error', message: 'Invalid Mail ID.' });
    setBusy(true);
    try {
      await setCutOff(date, mail);
      refresh();
      setBanner({ type: 'success', message: 'Date Saved.' });
    } catch (e) {
      setBanner({ type: 'error', message: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Cut-off date for changing</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <Section title="Current setting">
        <div className={grid}>
          <Info label="Policy year" value={ctx?.YearText} />
          <Info label="Cut-off date" value={fmtDate(ctx?.CutOffDate ?? null)} />
          <Info label="Insurance mail id" value={ctx?.InsurerMail} />
        </div>
      </Section>
      <Section title="Change" note="After the cut-off date only new joiners (within 30 days of joining) and HR can apply">
        <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date" required htmlFor="co">
            <input id="co" type="date" className={inputCls()} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Insurance Mail Id" htmlFor="im">
            <input id="im" type="email" className={inputCls()} value={mail} onChange={(e) => setMail(e.target.value)} maxLength={241} />
          </Field>
        </div>
        <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary mt-3 !px-4 !py-2 text-[12.5px]">
          <Save size={14} />
          {busy ? 'Saving...' : 'Save'}
        </button>
      </Section>
    </div>
  );
}

export default function CutOffPage() {
  return (
    <AdminGuard hrOnly>
      <CutOff />
    </AdminGuard>
  );
}
