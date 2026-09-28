'use client';

// Home dashboard — port of controller/secondImage.controller.js + view/secondImage.view.xml.
//
// On load (_objPatternMatched):
//  - resets countParameters (SubLglEntL1/SubLglEntL2/FiscalYear/Scheduling/Period = "")
//  - GET CheckAuditHeadSet('') -> if AuditHead == 'X' the "Change Role" button shows and
//    GET AuditNameCheckSet('') decides: Utype 'A' / 'R' -> load dashboards, anything else -> ask
//    "As Audit Head / As Reviewer/Performer" and POST ConfAuditHeadSet { ReturnValue }.
//    Not an audit head -> load dashboards straight away (fnWrapper).
//  - GET ZSTR_MSD_ALL_COUNTSet ($filter AuthFlag eq 'A') -> the count table + filter dropdowns.
// fnWrapper: GET ZSTR_MSD_DASHBOARDSet twice (AuthFlag 'A' -> Audit Head Summary tiles, AuthFlag
// 'S' -> Performer/Reviewer Summary tiles), each with FiscalYear when one is selected, then
// re-reads screen authorization (authCheck -> ZST_AUTH_USERSet).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserCog } from 'lucide-react';
import { And, applyFilters, create, F, Or, read, readEntity, type Filter } from '../lib/odata';
import { useApp } from '../context/AppContext';
import { useUi } from '../context/UiContext';
import { useNavTo } from '../lib/routes';
import { nameFromEmail } from '../lib/hubEmailLogin';
import { Card, DataTable, Dialog, Link, RadioGroup, Select, type Column, type Option } from '../components/ui';
import { LiveClock } from '../components/home/LiveClock';

type CountRow = Record<string, any>;

interface Kpis {
  TotSchedl: string;
  TotKikoff: string;
  TotClosed: string;
  TotInproc: string;
  TotAccptd: string;
}

const ZERO_KPIS: Kpis = { TotSchedl: '0', TotKikoff: '0', TotClosed: '0', TotInproc: '0', TotAccptd: '0' };

function kpisFrom(first: Record<string, any>): Kpis {
  return {
    TotSchedl: String(first.TotSchedl ?? ''),
    TotKikoff: String(first.TotKikoff ?? ''),
    TotClosed: String(first.TotClosed ?? ''),
    TotInproc: first.TotInproc ? String(first.TotInproc) : '0',
    TotAccptd: first.TotAccptd ? String(first.TotAccptd) : '0',
  };
}

/** The one filter the source rebuilds on each dropdown change: an AND of single-entry OR groups. */
function tableFilter(parts: [string, string][]): Filter {
  return And(parts.map(([path, v]) => Or([F(path, 'EQ', v)])));
}

function Tile({ header, value, onPress }: { header: string; value: string; onPress?: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="glass-card flex min-h-[96px] flex-col justify-between p-3 text-left transition-transform hover:-translate-y-0.5"
    >
      <span className="text-[12px] font-bold text-inkSoft">{header}</span>
      <span className="text-[24px] font-bold text-rust">{value}</span>
      <span className="h-1.5 w-3/5 rounded-full bg-green" />
    </button>
  );
}

function InProcessTile({ pending, accepted, onPending, onAccepted }: { pending: string; accepted: string; onPending: () => void; onAccepted: () => void }) {
  return (
    <div className="glass-card flex min-h-[96px] flex-col p-3">
      <span className="mb-1 text-center text-[12px] font-bold text-inkSoft">In Process</span>
      <div className="grid flex-1 grid-cols-2 divide-x divide-border">
        <div className="flex flex-col items-start gap-1 pr-2">
          <span className="text-[22px] font-bold text-rust">{pending}</span>
          <Link onClick={onPending}>Pending</Link>
          <span className="h-1.5 w-4/5 rounded-full bg-green" />
        </div>
        <div className="flex flex-col items-start gap-1 pl-2">
          <span className="text-[22px] font-bold text-rust">{accepted}</span>
          <Link onClick={onAccepted}>Accepted</Link>
          <span className="h-1.5 w-4/5 rounded-full bg-green" />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const ui = useUi();
  const navTo = useNavTo();
  const { email, mergeParams, screenAuth, refreshScreenAuth } = useApp();

  const [countData, setCountData] = useState<CountRow[]>([]);
  const [legalEntities, setLegalEntities] = useState<Option[]>([]);
  const [financialYears, setFinancialYears] = useState<Option[]>([]);
  const [subEntity1, setSubEntity1] = useState<Option[]>([]);
  const [subEntity2, setSubEntity2] = useState<Option[]>([]);
  const [legalEntity, setLegalEntity] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [sub1, setSub1] = useState('');
  const [sub2, setSub2] = useState('');
  const [filter, setFilter] = useState<Filter | undefined>(undefined);

  const [nOfAudit, setNOfAudit] = useState('');
  const [perfNOfAudit, setPerfNOfAudit] = useState('');
  const [showHead, setShowHead] = useState(false);
  const [showPerformer, setShowPerformer] = useState(false);
  const [headKpis, setHeadKpis] = useState<Kpis>({ ...ZERO_KPIS, TotSchedl: '', TotKikoff: '', TotClosed: '' });
  const [perfKpis, setPerfKpis] = useState<Kpis>({ ...ZERO_KPIS, TotSchedl: '', TotKikoff: '', TotClosed: '' });

  const [changeRoleVisible, setChangeRoleVisible] = useState(false);
  const [roleDialog, setRoleDialog] = useState<null | 'initial' | 'change'>(null);
  const [roleChoice, setRoleChoice] = useState<'A' | 'R'>('A');

  const fiscalYearRef = useRef('');
  fiscalYearRef.current = fiscalYear;

  const visibleCounts = useMemo(() => applyFilters(countData, filter), [countData, filter]);

  // fnWrapper
  const fnWrapper = useCallback(async () => {
    const sFiscalYear = fiscalYearRef.current;

    const aFiltersA = [F('AuthFlag', 'EQ', 'A')];
    if (sFiscalYear) aFiltersA.push(F('FiscalYear', 'EQ', sFiscalYear));
    read<Record<string, any>>('/ZSTR_MSD_DASHBOARDSet', { filters: aFiltersA })
      .then(({ results }) => {
        if (results.length > 0 && results[0].AuthFlag == 'A') setShowHead(true);
        setHeadKpis(results.length > 0 ? kpisFrom(results[0]) : ZERO_KPIS);
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    const aFiltersS = [F('AuthFlag', 'EQ', 'S')];
    if (sFiscalYear) aFiltersS.push(F('FiscalYear', 'EQ', sFiscalYear));
    read<Record<string, any>>('/ZSTR_MSD_DASHBOARDSet', { filters: aFiltersS })
      .then(({ results }) => {
        if (results.length > 0 && results[0].AuthFlag == 'S') setShowPerformer(true);
        setPerfKpis(results.length > 0 ? kpisFrom(results[0]) : ZERO_KPIS);
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    // this.authCheck()
    refreshScreenAuth().catch(() => ui.messageBox.error('Internal Server error'));
  }, [ui, refreshScreenAuth]);

  // fnProcessScreen / fnProcessScreenChange
  const processScreen = useCallback(
    async (sText: 'A' | 'R', isChange: boolean) => {
      try {
        await create('/ConfAuditHeadSet', { ReturnValue: sText });
        if (isChange) {
          window.location.reload();
          return;
        }
        fnWrapper();
        ui.toast(sText === 'A' ? 'Logged in as audit head.' : 'Logged in as reviewer/performer');
      } catch {
        // Source error handler is empty.
      }
    },
    [fnWrapper, ui],
  );

  // _objPatternMatched
  useEffect(() => {
    setShowHead(false);
    setShowPerformer(false);
    setFiscalYear('');
    setSub1('');
    setSub2('');
    mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });

    readEntity<Record<string, any>>("/CheckAuditHeadSet('')")
      .then(async (oSuccess) => {
        if (oSuccess?.AuditHead == 'X') {
          setChangeRoleVisible(true);
          try {
            const check = await readEntity<Record<string, any>>("/AuditNameCheckSet('')");
            if (check?.Utype == 'A') {
              fnWrapper();
              ui.toast('Logged in as audit head.');
            } else if (check?.Utype == 'R') {
              fnWrapper();
              ui.toast('Logged in as reviewer/performer');
            } else {
              setRoleChoice('A');
              setRoleDialog('initial');
            }
          } catch {
            // Source error handler is empty.
          }
        } else {
          fnWrapper();
        }
      })
      .catch(() => ui.messageBox.error('Something went wrong'));

    read<CountRow>('/ZSTR_MSD_ALL_COUNTSet', { filters: [And([F('AuthFlag', 'EQ', 'A')])] })
      .then(({ results }) => {
        setCountData(results);
        if (results.length > 0) {
          const total = String(results[0].TotAudit ?? '');
          setNOfAudit(total);
          setPerfNOfAudit(total);
        }
        const uniq = (key: string) => {
          const m = new Map<unknown, CountRow>();
          results.forEach((r) => m.set(r[key], r));
          return Array.from(m.values());
        };
        const le = uniq('LglEnt').map((r) => ({ key: String(r.LglEnt ?? ''), text: String(r.LglEnt ?? '') }));
        if (le.length > 0) {
          setLegalEntities(le);
          // forceSelection="true": the first legal entity is selected.
          setLegalEntity((cur) => cur || le[0].key);
        }
        const fy = uniq('FiscalYear').map((r) => ({ key: String(r.FiscalYear ?? ''), text: String(r.FiscalYear ?? '') }));
        if (fy.length > 0) setFinancialYears([...fy, { key: '', text: '' }]);
      })
      .catch(() => {
        // Source error handler is empty.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // onFilterFinancialYear
  const onFilterFinancialYear = (selectedKey: string) => {
    setFiscalYear(selectedKey);
    fiscalYearRef.current = selectedKey;
    const m = new Map<unknown, CountRow>();
    countData.filter((d) => d.FiscalYear == selectedKey).forEach((r) => m.set(r.SubLglEntL1, r));
    setSubEntity1([...Array.from(m.values()).map((r) => ({ key: String(r.SubLglEntL1 ?? ''), text: String(r.SubLglEntL1 ?? '') })), { key: '', text: '' }]);
    setSub1('');
    setSub2('');

    const parts: [string, string][] = [['LglEnt', legalEntity]];
    if (selectedKey != '') parts.push(['FiscalYear', selectedKey]);
    const f = tableFilter(parts);
    setFilter(f);

    // Re-read the Audit Head dashboard — the source uses "Fiscalyear" (lower-case y) here, unlike
    // fnWrapper's "FiscalYear"; kept exactly.
    const aFiltersA = [F('AuthFlag', 'EQ', 'A')];
    if (selectedKey) aFiltersA.push(F('Fiscalyear', 'EQ', selectedKey));
    read<Record<string, any>>('/ZSTR_MSD_DASHBOARDSet', { filters: aFiltersA })
      .then(({ results }) => {
        if (results.length > 0 && results[0].AuthFlag == 'A') setShowHead(true);
        if (results.length > 0) {
          const k = kpisFrom(results[0]);
          setHeadKpis(k);
          setPerfKpis(k);
        } else {
          setHeadKpis(ZERO_KPIS);
        }
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    // No of Audits = the filtered table's row count.
    const count = String(applyFilters(countData, f).length);
    setNOfAudit(count);
    setPerfNOfAudit(count);
  };

  // onFilterSubEntity1
  const onFilterSubEntity1 = (selectedKey: string) => {
    setSub1(selectedKey);
    const m = new Map<unknown, CountRow>();
    countData.filter((d) => d.SubLglEntL1 == selectedKey).forEach((r) => m.set(r.SubLglEntL2, r));
    setSubEntity2([...Array.from(m.values()).map((r) => ({ key: String(r.SubLglEntL2 ?? ''), text: String(r.SubLglEntL2 ?? '') })), { key: '', text: '' }]);
    setSub2('');
    const parts: [string, string][] = [
      ['LglEnt', legalEntity],
      ['FiscalYear', fiscalYear],
    ];
    if (selectedKey != '') parts.push(['SubLglEntL1', selectedKey]);
    setFilter(tableFilter(parts));
  };

  // onFilterSubEntity2
  const onFilterSubEntity2 = (selectedKey: string) => {
    setSub2(selectedKey);
    const parts: [string, string][] = [
      ['LglEnt', legalEntity],
      ['FiscalYear', fiscalYear],
      ['SubLglEntL1', sub1],
    ];
    if (selectedKey != '') parts.push(['SubLglEntL2', selectedKey]);
    setFilter(tableFilter(parts));
  };

  // fnHandleTileAuth — uses the already-loaded ScreenAuth, like the source.
  const fnHandleTileAuth = (routeText: 'Audit Scheduling' | 'Audit Kickoff') => {
    if (screenAuth.All) {
      if (routeText === 'Audit Scheduling') return navTo('auditScheduling');
      return navTo('auditKickoff');
    }
    if (screenAuth.Scheduling && routeText === 'Audit Scheduling') return navTo('auditScheduling');
    if (screenAuth.KickOff && routeText === 'Audit Kickoff') return navTo('auditKickoff');
    ui.messageBox.error(`You are not authorised to ${routeText} page`);
  };

  // onPressCount
  const onPressCount = async (row: CountRow, linkType: 'TotSchedl' | 'TotKikoff' | 'TotInproc' | 'TotAccptd' | 'TotClosed') => {
    mergeParams('countParameters', {
      SubLglEntL1: row.SubLglEntL1,
      SubLglEntL2: row.SubLglEntL2,
      FiscalYear: row.FiscalYear,
      Scheduling: row.Scheduling,
      Period: row.Period,
    });
    if (linkType === 'TotSchedl' || linkType === 'TotKikoff') {
      try {
        const { results } = await read<Record<string, any>>('/ZST_AUTH_USERSet');
        if (results.length === 0) {
          ui.messageBox.error('You are not authorized');
          return;
        }
        const r = results[0];
        if (linkType === 'TotSchedl' && (r.ActAll == 'X' || r.ActScheduling == 'X')) return navTo('auditScheduling');
        if (linkType === 'TotKikoff' && (r.ActAll == 'X' || r.ActKickoff == 'X')) return navTo('auditKickoff');
        ui.messageBox.error('You are not authorized');
      } catch {
        ui.messageBox.error('Internal Server error');
      }
      return;
    }
    if (linkType === 'TotInproc') navTo('pending');
    else if (linkType === 'TotAccptd') navTo('inProcess');
    else navTo('closed');
  };

  const countLink = (key: 'TotSchedl' | 'TotKikoff' | 'TotInproc' | 'TotAccptd' | 'TotClosed', header: string): Column<CountRow> => ({
    key,
    header,
    render: (r) => <Link onClick={() => onPressCount(r, key)}>{String(r[key] ?? '')}</Link>,
  });

  const columns: Column<CountRow>[] = [
    { key: 'FiscalYear', header: 'Fiscal Year' },
    { key: 'SubLglEntL2', header: 'Location', width: '9rem' },
    { key: 'Period', header: 'Period', width: '9rem' },
    countLink('TotSchedl', 'Scheduled'),
    countLink('TotKikoff', 'Kick Off'),
    countLink('TotInproc', 'Pending'),
    countLink('TotAccptd', 'Accepted'),
    countLink('TotClosed', 'Closed'),
  ];

  const summary = (title: string, audits: string, k: Kpis) => (
    <section className="space-y-2">
      <h2 className="text-[13px] font-bold text-ink">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tile header="No of Audits" value={audits} onPress={() => fnHandleTileAuth('Audit Kickoff')} />
        <Tile header="Process Scheduled" value={k.TotSchedl} onPress={() => fnHandleTileAuth('Audit Scheduling')} />
        <Tile header="Process Kick Off" value={k.TotKikoff} onPress={() => fnHandleTileAuth('Audit Kickoff')} />
        <InProcessTile pending={k.TotInproc} accepted={k.TotAccptd} onPending={() => navTo('pending')} onAccepted={() => navTo('inProcess')} />
        <Tile header="Process Closed" value={k.TotClosed} onPress={() => navTo('closed')} />
      </div>
    </section>
  );

  return (
    <div className="animate-fadeIn space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-[17px] font-bold text-ink">My Dashboard</h1>
        {changeRoleVisible && (
          <button
            type="button"
            className="btn-ghost !py-1.5"
            onClick={() => {
              setRoleChoice('A');
              setRoleDialog('change');
            }}
          >
            <UserCog size={14} />
            Change Role
          </button>
        )}
        {email && <span className="text-[12px] font-semibold text-ink">{nameFromEmail(email)}</span>}
        <LiveClock />
      </div>

      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* Legal entity change has no handler in the source (OnFilterLegal isn't defined on this
              controller) — it only feeds the filters built by the other three dropdowns. */}
          <Select value={legalEntity} onChange={setLegalEntity} options={legalEntities} />
          <Select value={fiscalYear} onChange={onFilterFinancialYear} options={financialYears} placeholder={financialYears.length ? undefined : ''} />
          <Select value={sub1} onChange={onFilterSubEntity1} options={subEntity1} placeholder={subEntity1.length ? undefined : ''} />
          <Select value={sub2} onChange={onFilterSubEntity2} options={subEntity2} placeholder={subEntity2.length ? undefined : ''} />
        </div>

        {showHead && summary('Audit Head Summary', nOfAudit, headKpis)}
        {showPerformer && summary('Performer/Reviewer Summary', perfNOfAudit, perfKpis)}
      </Card>

      <DataTable columns={columns} rows={visibleCounts} growingThreshold={10} maxHeight="50vh" />

      <Dialog
        open={roleDialog !== null}
        title="Confirm"
        onClose={() => setRoleDialog(null)}
        width="max-w-sm"
        footer={
          <>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                const isChange = roleDialog === 'change';
                setRoleDialog(null);
                processScreen(roleChoice, isChange);
              }}
            >
              Confirm
            </button>
            <button type="button" className="btn-ghost" onClick={() => setRoleDialog(null)}>
              Cancel
            </button>
          </>
        }
      >
        <RadioGroup
          name="auditRole"
          vertical
          value={roleChoice}
          onChange={(v) => setRoleChoice(v as 'A' | 'R')}
          options={[
            { key: 'A', text: 'As Audit Head' },
            { key: 'R', text: 'As Reviewer/Performer' },
          ]}
        />
      </Dialog>
    </div>
  );
}
