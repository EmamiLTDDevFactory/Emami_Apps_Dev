'use client';

// closed.controller.js / MISClosed.controller.js (+ their views) — identical screens except for
// the ZSTR_MSD_AUD_PROC_LISTSet read: "closed" filters by the dashboard's countParameters plus
// Action 'C' (and then clears countParameters), "mis" reads Action 'F' only. Row "view" goes to
// closed2Screen / MISClosed2 via auditJsonModel>/Closed2/* (CLOSED2_PARAMS).
import React, { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { Page, Card, Select, DataTable, uniqueBy, formatDateDisplay, type Option } from '../ui';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { useNavTo } from '../../lib/routes';
import { And, F, Or, applyFilters, read, type Filter, type MultiFilter } from '../../lib/odata';
import { Clock } from './Dialogs';
import { CLOSED2_PARAMS, fetchAuditManagers, type Row } from './shared';

type Variant = 'closed' | 'mis';

/** Select items; the source lists' trailing blank entry is rendered as each Select's empty
 * placeholder option instead of a second blank row. */
function opts(rows: Row[], key: string): Option[] {
  return rows.filter((r) => String(r[key] ?? '') !== '').map((r) => ({ key: String(r[key]), text: String(r[key]) }));
}

/** The dedupe-then-append-empty idiom used by every dependent Select on this screen. */
function dedupeWithBlank(rows: Row[], key: string): Row[] {
  return [...uniqueBy(rows, key), { [key]: '' }];
}

const userName = (u: Row) => `${u.Fname} ${u.Lname}`;

export default function ClosedList({ variant }: { variant: Variant }) {
  const { getParams, mergeParams, setParams } = useApp();
  const ui = useUi();
  const navTo = useNavTo();

  const [rows, setRows] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [subEntity3, setSubEntity3] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);

  const [legal, setLegal] = useState('');
  const [fy, setFy] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [se3, setSe3] = useState('');
  const [performer, setPerformer] = useState('');
  const [reviewer, setReviewer] = useState('');

  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    let filters: Filter[];
    if (variant === 'closed') {
      const cp = getParams<Record<string, any>>('countParameters');
      filters = [
        And([
          F('FinancialYear', 'EQ', cp.FiscalYear),
          F('Scheduling', 'EQ', cp.Scheduling),
          F('Period', 'EQ', cp.Period),
          F('SubLglEntL1', 'EQ', cp.SubLglEntL1),
          F('SubLglEntL2', 'EQ', cp.SubLglEntL2),
          F('Action', 'EQ', 'C'),
        ]),
      ];
      mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });
    } else {
      filters = [And([F('Action', 'EQ', 'F')])];
    }

    read<Row>('/ZSTR_MSD_AUD_PROC_LISTSet', { filters })
      .then(({ results }) => {
        results.forEach((r, i) => {
          r.slNo = i + 1;
        });
        setRows(results);
        const le = uniqueBy(results, 'LglEnt').map((r) => ({ LglEnt: r.LglEnt }));
        setLegalEntities(le);
        // Select forceSelection="true" — the first legal entity is selected.
        setLegal(le.length > 0 ? String(le[0].LglEnt ?? '') : '');
        if (results.length > 0) {
          setFinancialYears([...uniqueBy(results, 'FinancialYear').map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
        }
      })
      .catch(() => ui.messageBox.error('Internal Server error'));

    fetchAuditManagers()
      .then(setUsers)
      .catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const leFilter = (): MultiFilter => And([Or([F('LglEnt', 'EQ', legal)])]);
  const push = (f: MultiFilter, path: string, value: string) => f.filters.push(Or([F(path, 'EQ', value)]));

  const onFilterFinancialYear = (key: string) => {
    setFy(key);
    setSubEntity1(dedupeWithBlank(rows.filter((r) => r.FinancialYear == key), 'SubLglEntL1'));
    setSe1('');
    setSe2('');
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f = leFilter();
    if (key != '') push(f, 'FinancialYear', key);
    setTableFilter(f);
  };

  const onFilterSubEntity1 = (key: string) => {
    setSe1(key);
    setSubEntity2(dedupeWithBlank(rows.filter((r) => r.SubLglEntL1 == key), 'SubLglEntL2'));
    setSe2('');
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f = leFilter();
    push(f, 'FinancialYear', fy);
    if (key != '') push(f, 'SubLglEntL1', key);
    setTableFilter(f);
  };

  const onFilterSubEntity2 = (key: string) => {
    setSe2(key);
    setSubEntity3(dedupeWithBlank(rows.filter((r) => r.SubLglEntL2 == key), 'Scheduling'));
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f = leFilter();
    push(f, 'FinancialYear', fy);
    push(f, 'SubLglEntL1', se1);
    if (key != '') push(f, 'SubLglEntL2', key);
    setTableFilter(f);
  };

  const onFilterSubEntity3 = (key: string) => {
    setSe3(key);
    const f = leFilter();
    push(f, 'FinancialYear', fy);
    push(f, 'SubLglEntL1', se1);
    push(f, 'SubLglEntL2', se2);
    if (key != '') push(f, 'Scheduling', key);
    setTableFilter(f);
    setPerformer('');
    setReviewer('');
  };

  // Performer / Reviewer filters skip empty values (unlike the entity chain above) and do NOT
  // include Scheduling — same as the source handlers.
  const onFilterPerformer = (key: string) => {
    setPerformer(key);
    const f = leFilter();
    if (fy != '') push(f, 'FinancialYear', fy);
    if (se1 != '') push(f, 'SubLglEntL1', se1);
    if (se2 != '') push(f, 'SubLglEntL2', se2);
    if (reviewer != '') push(f, 'Reviewer', reviewer);
    if (key != '') push(f, 'Performer', key);
    setTableFilter(f);
  };

  const onFilterReviewer = (key: string) => {
    setReviewer(key);
    const f = leFilter();
    if (fy != '') push(f, 'FinancialYear', fy);
    if (se1 != '') push(f, 'SubLglEntL1', se1);
    if (se2 != '') push(f, 'SubLglEntL2', se2);
    if (performer != '') push(f, 'Performer', performer);
    if (key != '') push(f, 'Reviewer', key);
    setTableFilter(f);
  };

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);
  useEffect(() => setSelected(new Set()), [visibleRows]);

  const handleClosedNextScreenPress = (r: Row) => {
    setParams(CLOSED2_PARAMS, {
      SubLglEntL1: r.SubLglEntL1,
      SubLglEntL2: r.SubLglEntL2,
      Process: r.Process,
      SubProcess: r.SubProcess,
      Period: r.Period,
      Scheduling: r.Scheduling,
      Gjahr: r.FinancialYear,
    });
    navTo(variant === 'closed' ? 'closed2Screen' : 'MISClosed2');
  };

  const userOptions = users.map((u) => ({ key: userName(u), text: userName(u) }));

  return (
    <Page title={variant === 'closed' ? 'Closed' : 'MIS - Closed'} actions={<Clock />}>
      <Card>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {/* change="OnFilterLegal" has no handler in the source controller — selecting a legal
              entity only changes the key used by the other filters. */}
          <Select value={legal} onChange={setLegal} options={opts(legalEntities, 'LglEnt')} />
          <Select value={fy} onChange={onFilterFinancialYear} options={opts(financialYears, 'FinancialYear')} placeholder="Financial Year" />
          <Select value={se1} onChange={onFilterSubEntity1} options={opts(subEntity1, 'SubLglEntL1')} placeholder="Sub Entity 1" />
          <Select value={se2} onChange={onFilterSubEntity2} options={opts(subEntity2, 'SubLglEntL2')} placeholder="Sub Entity 2" />
          <Select value={se3} onChange={onFilterSubEntity3} options={opts(subEntity3, 'Scheduling')} placeholder="Scheduling" />
          <Select value={performer} onChange={onFilterPerformer} options={userOptions} placeholder="Performer" />
          <Select value={reviewer} onChange={onFilterReviewer} options={userOptions} placeholder="Reviewer" />
        </div>
      </Card>

      <DataTable
        rows={visibleRows}
        selectionMode="MultiSelect"
        selected={selected}
        onSelectionChange={setSelected}
        growingThreshold={10}
        maxHeight="60vh"
        columns={[
          { key: 'slNo', header: 'Sl No.', width: '3rem' },
          { key: 'Location', header: 'Location' },
          { key: 'Process', header: 'Process' },
          { key: 'FinancialYear', header: 'Year' },
          { key: 'Period', header: 'Month' },
          { key: 'Performer', header: 'Performer' },
          { key: 'Reviewer', header: 'Reviewer' },
          { key: 'ActBegda', header: 'Actual Start Date', render: (r) => formatDateDisplay(r.ActBegda) },
          { key: 'ActEnnda', header: 'Actual End Date', render: (r) => formatDateDisplay(r.ActEnnda) },
          {
            key: 'action',
            header: 'Action',
            render: (r) => (
              <button type="button" aria-label="View" className="p-1 text-rust hover:text-rustDeep" onClick={() => handleClosedNextScreenPress(r)}>
                <Eye size={16} />
              </button>
            ),
          },
        ]}
      />
    </Page>
  );
}
