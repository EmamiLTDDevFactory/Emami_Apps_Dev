'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import HubGate from '../components/HubGate';
import Sidebar from '../components/Sidebar';
import { TopBar } from '../components/Topbar';
import { FiltersBar } from '../components/FiltersBar';
import { CaseList } from '../components/CaseList';
import { Drawer } from '../components/Drawer';
import { ErrorNotice, type PageState } from '../components/Shared';
import { ExecPage, WorkbenchPage } from '../components/Pages';
import { EntryExplorerPage, PatternsPage } from '../components/Pages2';
import { CloseGuardPage, IntegrationsPage } from '../components/Pages3';
import { EvidencePage, ModelPage } from '../components/Pages4';
import { SecurityPage } from '../components/Pages5';
import { useIsWideScreen } from '../lib/useIsWideScreen';
import { SAP_CONFIGURED, fetchCompanyCodeOptions, fetchExplanation, fetchSummary, fetchWorklist } from '../lib/sapClient';
import type { CompanyCodeOption, Explanation, FilterDraft, Summary, WorklistEntry } from '../types';

const DEFAULT_DRAFT: FilterDraft = { companyCode: '', period: '', risk: '' };

function DashboardContent() {
  const [page, setPage] = useState('exec');
  const [draft, setDraft] = useState<FilterDraft>(DEFAULT_DRAFT);
  const [applied, setApplied] = useState<FilterDraft>(DEFAULT_DRAFT);
  const [items, setItems] = useState<WorklistEntry[]>([]);
  const [summary, setSummary] = useState<Summary>();
  const [companyCodeOptions, setCompanyCodeOptions] = useState<CompanyCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [navOpen, setNavOpen] = useState(false);
  const isWideScreen = useIsWideScreen();
  const [drawerEntry, setDrawerEntry] = useState<WorklistEntry | null>(null);
  const [explorerEntry, setExplorerEntry] = useState<WorklistEntry | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [exportType, setExportType] = useState('CSV');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toast = (m: string) => {
    setToastMsg(m);
    window.setTimeout(() => setToastMsg((cur) => (cur === m ? null : cur)), 2200);
  };

  const load = useCallback((f: FilterDraft) => {
    setLoading(true);
    setError(null);
    fetchWorklist(f)
      .then((rows) => {
        setItems(rows);
        setUpdatedAt(Date.now());
      })
      .catch((e: Error) => setError(e.message || 'Request failed'))
      .finally(() => setLoading(false));
    fetchSummary(f.companyCode).then(setSummary);
  }, []);

  useEffect(() => {
    load(applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  useEffect(() => {
    fetchCompanyCodeOptions().then(setCompanyCodeOptions);
  }, []);

  useEffect(() => {
    const target = explorerEntry ?? items[0] ?? null;
    if (!target) {
      setExplanation(null);
      return;
    }
    fetchExplanation(target).then(setExplanation);
  }, [explorerEntry, items]);

  const applyFilters = () => setApplied(draft);
  const resetFilters = () => {
    setDraft(DEFAULT_DRAFT);
    setApplied(DEFAULT_DRAFT);
  };

  const openDrawer = (e: WorklistEntry) => setDrawerEntry(e);
  const navigate = (id: string) => {
    setPage(id);
    if (id === 'explorer') setExplorerEntry(items[0] ?? null);
  };

  const state: PageState = { loading, error, items, open: openDrawer, toast };
  const freshMinutes = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 60000)) : null;

  return (
    <div className="layout">
      <Sidebar
        isOpen={navOpen}
        onClose={() => setNavOpen(false)}
        isWideScreen={isWideScreen}
        activePage={page}
        onNavigate={navigate}
        live={SAP_CONFIGURED}
      />
      {!isWideScreen && navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      <div className="main-column">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="back-to-hub">
          <ArrowLeft size={14} /> Back to Emami Apps
        </a>
        <TopBar
          freshMinutes={freshMinutes}
          hasError={!!error}
          items={items}
          toast={toast}
          onMenu={() => setNavOpen(true)}
          isWideScreen={isWideScreen}
          exportType={exportType}
          setExportType={setExportType}
          onRefresh={() => {
            load(applied);
            toast('Risk population refreshed');
          }}
        />
        <div className="content">
          <FiltersBar draft={draft} setDraft={setDraft} onApply={applyFilters} onReset={resetFilters} companyCodeOptions={companyCodeOptions} />
          <div className="notice">
            AI risk scores indicate exceptions for review, not proof of error or fraud. Human approval, segregation of duties, SAP authorization
            validation and evidence retention remain mandatory.
          </div>
          {error && <ErrorNotice message={error} onRetry={() => load(applied)} sample />}

          {page === 'exec' && <ExecPage state={state} summary={summary} />}
          {page === 'workbench' && <WorkbenchPage state={state} summary={summary} />}
          {page === 'explorer' && <EntryExplorerPage state={state} entry={explorerEntry ?? items[0] ?? null} explanation={explanation} />}
          {page === 'patterns' && <PatternsPage state={state} />}
          {page === 'close' && <CloseGuardPage state={state} />}
          {page === 'integrations' && <IntegrationsPage />}
          {page === 'cases' && <CaseList toast={toast} />}
          {page === 'evidence' && <EvidencePage toast={toast} />}
          {page === 'model' && <ModelPage />}
          {page === 'security' && <SecurityPage />}
        </div>
      </div>
      <div className={'overlay' + (drawerEntry ? ' open' : '')} onClick={() => setDrawerEntry(null)} />
      <Drawer entry={drawerEntry} onClose={() => setDrawerEntry(null)} toast={toast} />
      <div className={'toast' + (toastMsg ? ' show' : '')}>{toastMsg}</div>
    </div>
  );
}

export default function JournalAnomalyAgentPage() {
  return (
    <HubGate>
      <DashboardContent />
    </HubGate>
  );
}
