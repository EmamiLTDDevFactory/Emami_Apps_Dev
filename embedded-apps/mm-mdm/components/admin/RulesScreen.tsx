'use client';

import { useEffect, useState } from 'react';
import { getAdminSession } from '@/lib/admin/adminApi';
import { LoadingState } from '../ui';
import { IconFlow, IconLayers } from '../icons';
import RuleSetsPanel from './rules/RuleSetsPanel';
import FieldControlPanel from './rules/FieldControlPanel';

type Tab = 'rules' | 'fields';

/**
 * Rules maintenance (replaces the Web Dynpro component /INOWITS/MDM_CONFIG):
 *  - default value rules of the request apps (rule sets, rules, test),
 *  - field control per material type (visible / required / display only), published as a new version.
 */
export default function RulesScreen() {
  const [tab, setTab] = useState<Tab>('rules');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => { getAdminSession().then((s) => setIsAdmin(!!s.isAdmin)).catch(() => setIsAdmin(false)); }, []);

  if (isAdmin === null) return <section className="card"><LoadingState text="Checking your access…" /></section>;

  return (
    <>
      <section className="card">
        <div className="card-bar">
          <div className="block-head"><span className="block-icon"><IconFlow size={16} /></span><h2>Rules maintenance</h2></div>
        </div>
        <p className="muted rl-lead">
          Default value rules fill fields of a new request automatically (for example the storage location from plant and material type).
          Field control decides which fields are shown, mandatory or display only for a material type. Everything here is read from and saved to SAP.
        </p>
        {!isAdmin && <div className="alert alert-warn rl-msg" role="status"><div><p>Your access to this area is read only. Saving needs the Admin role of Material master.</p></div></div>}
        <div className="status-chips" role="tablist" aria-label="Rules maintenance">
          <button type="button" role="tab" id="rl-tab-rules" aria-selected={tab === 'rules'} aria-controls="rl-panel" className={`schip ${tab === 'rules' ? 'on' : ''}`} onClick={() => setTab('rules')}><IconFlow size={13} /> Default value rules</button>
          <button type="button" role="tab" id="rl-tab-fields" aria-selected={tab === 'fields'} aria-controls="rl-panel" className={`schip ${tab === 'fields' ? 'on' : ''}`} onClick={() => setTab('fields')}><IconLayers size={13} /> Field control</button>
        </div>
      </section>
      <div id="rl-panel" role="tabpanel" aria-labelledby={tab === 'rules' ? 'rl-tab-rules' : 'rl-tab-fields'}>
        {tab === 'rules' ? <RuleSetsPanel canEdit={isAdmin} /> : <FieldControlPanel canEdit={isAdmin} />}
      </div>
    </>
  );
}
