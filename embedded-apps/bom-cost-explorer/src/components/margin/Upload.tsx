'use client';
/** Margin > Upload (role cogm-maint or Admin): one tab per Kind, check before save, and the read-only current data. */
import { useState } from 'react';
import MarginFrame from './MarginFrame';
import { Tabs } from '../ui';
import UploadKindTab from './upload/UploadKind';
import CurrentData from './upload/CurrentData';
import { KIND_LABEL, UPLOAD_KINDS, type UploadKind } from '@/lib/margin/uploadKinds';

type Tab = UploadKind | 'CURRENT';

export default function Upload() {
  const [tab, setTab] = useState<Tab>('PRICE');
  return (
    <MarginFrame active="margin-upload" need="maintain" title="Upload" subtitle="Prices, volumes, budgets, actuals, targets and alert rules for the Margin module. Check first: nothing is saved by a check, and one error row means nothing is saved.">
      {({ email }) => (
        <>
          <Tabs<Tab> label="Upload kinds" value={tab} onChange={setTab} tabs={[...UPLOAD_KINDS.map((k) => ({ id: k as Tab, label: KIND_LABEL[k] })), { id: 'CURRENT' as Tab, label: 'Current data' }]} />
          {tab === 'CURRENT' ? <CurrentData /> : <UploadKindTab key={tab} kind={tab} email={email} />}
        </>
      )}
    </MarginFrame>
  );
}
