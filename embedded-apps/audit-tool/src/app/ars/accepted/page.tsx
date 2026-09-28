'use client';

// Accepted — port of the Fiori inProcess view/controller. Lists accepted processes
// (ZSTR_MSD_AUD_PROC_LISTSet, Action 'I') scoped by the dashboard's countParameters, with the same
// cascading client-side filters (Legal Entity / Financial Year / Sub Entity 1 / Sub Entity 2 /
// Scheduling / Performer / Reviewer), and drills into the Process Summary.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import { useUi } from '../../../context/UiContext';
import { And, F, Or, applyFilters, read, type Filter, type MultiFilter } from '../../../lib/odata';
import { useNavTo } from '../../../lib/routes';
import { Card, DataTable, Page, Select, Toolbar, Field, uniqueBy, formatDateDisplay, type Column } from '../../../components/ui';

type Row = Record<string, any>;

/** new Filter({ filters: [new Filter({ filters: [new Filter(path, EQ, v)], and: false })], and: true }) */
function orOne(path: string, value: unknown): MultiFilter {
  return Or([F(path, 'EQ', value)]);
}

export default function AcceptedPage() {
  const { getParams, mergeParams } = useApp();
  const ui = useUi();
  const navTo = useNavTo();
  const loaded = useRef(false);

  const [rows, setRows] = useState<Row[]>([]);
  // auditJsonModel>/InProcess/* (Data, LegalEntity, FinancialYear, SubEntity1..3, FilterUserPerformer)
  const [data, setData] = useState<Row[]>([]);
  const [legalEntities, setLegalEntities] = useState<string[]>([]);
  const [financialYears, setFinancialYears] = useState<string[]>([]);
  const [subEntity1, setSubEntity1] = useState<string[]>([]);
  const [subEntity2, setSubEntity2] = useState<string[]>([]);
  const [subEntity3, setSubEntity3] = useState<string[]>([]);
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
    if (loaded.current) return;
    loaded.current = true;

    const inModel = getParams<Row>('countParameters');
    const filters = And([
      F('FinancialYear', 'EQ', inModel.FiscalYear ?? ''),
      F('Scheduling', 'EQ', inModel.Scheduling ?? ''),
      F('Period', 'EQ', inModel.Period ?? ''),
      F('SubLglEntL1', 'EQ', inModel.SubLglEntL1 ?? ''),
      F('SubLglEntL2', 'EQ', inModel.SubLglEntL2 ?? ''),
      F('Action', 'EQ', 'I'),
    ]);
    mergeParams('countParameters', { SubLglEntL1: '', SubLglEntL2: '', FiscalYear: '', Scheduling: '', Period: '' });

    read<Row>('/ZSTR_MSD_AUD_PROC_LISTSet', { filters: [filters] })
      .then(({ results }) => {
        const list: Row[] = results.map((r, i) => ({ ...r, slNo: i + 1 }));
        setRows(list);
        if (list.length > 0) setData(list);
        const le = uniqueBy(list, 'LglEnt').map((r) => String(r.LglEnt ?? ''));
        if (le.length > 0) {
          setLegalEntities(le);
          setLegal(le[0]); // forceSelection="true"
        }
        const years = uniqueBy(list, 'FinancialYear').map((r) => String(r.FinancialYear ?? ''));
        if (years.length > 0) setFinancialYears([...years, '']);
      })
      .catch(() => {
        /* the Fiori error handler is empty */
      });

    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => setUsers(results.filter((u) => u.IsAuditManager === 'X')))
      .catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);

  const userOptions = useMemo(
    () => users.map((u) => ({ key: `${u.Fname} ${u.Lname}`, text: `${u.Fname} ${u.Lname}` })),
    [users],
  );

  const setFilter = (f: Filter) => {
    setTableFilter(f);
    setSelected(new Set());
  };

  const onFilterFinancialYear = (key: string) => {
    setFy(key);
    const list = uniqueBy(data.filter((d) => d.FinancialYear == key), 'SubLglEntL1').map((r) => String(r.SubLglEntL1 ?? ''));
    setSubEntity1([...list, '']);
    setSe1('');
    setSe2('');
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f: Filter[] = [orOne('LglEnt', legal)];
    if (key !== '') f.push(orOne('FinancialYear', key));
    setFilter(And(f));
  };

  const onFilterSubEntity1 = (key: string) => {
    setSe1(key);
    const list = uniqueBy(data.filter((d) => d.SubLglEntL1 == key), 'SubLglEntL2').map((r) => String(r.SubLglEntL2 ?? ''));
    setSubEntity2([...list, '']);
    setSe2('');
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f: Filter[] = [orOne('LglEnt', legal), orOne('FinancialYear', fy)];
    if (key !== '') f.push(orOne('SubLglEntL1', key));
    setFilter(And(f));
  };

  const onFilterSubEntity2 = (key: string) => {
    setSe2(key);
    const list = uniqueBy(data.filter((d) => d.SubLglEntL2 == key), 'Scheduling').map((r) => String(r.Scheduling ?? ''));
    setSubEntity3([...list, '']);
    setSe3('');
    setPerformer('');
    setReviewer('');
    const f: Filter[] = [orOne('LglEnt', legal), orOne('FinancialYear', fy), orOne('SubLglEntL1', se1)];
    if (key !== '') f.push(orOne('SubLglEntL2', key));
    setFilter(And(f));
  };

  const onFilterSubEntity3 = (key: string) => {
    setSe3(key);
    const f: Filter[] = [orOne('LglEnt', legal), orOne('FinancialYear', fy), orOne('SubLglEntL1', se1), orOne('SubLglEntL2', se2)];
    if (key !== '') f.push(orOne('Scheduling', key));
    setFilter(And(f));
    setPerformer('');
    setReviewer('');
  };

  const personFilters = (): Filter[] => {
    const f: Filter[] = [orOne('LglEnt', legal)];
    if (fy !== '') f.push(orOne('FinancialYear', fy));
    if (se1 !== '') f.push(orOne('SubLglEntL1', se1));
    if (se2 !== '') f.push(orOne('SubLglEntL2', se2));
    return f;
  };

  const onFilterPerformer = (key: string) => {
    setPerformer(key);
    const f = personFilters();
    if (reviewer !== '') f.push(orOne('Reviewer', reviewer));
    if (key !== '') f.push(orOne('Performer', key));
    setFilter(And(f));
  };

  const onFilterReviewer = (key: string) => {
    setReviewer(key);
    const f = personFilters();
    if (performer !== '') f.push(orOne('Performer', performer));
    if (key !== '') f.push(orOne('Reviewer', key));
    setFilter(And(f));
  };

  const handleInProgressNextScreenPress = (row: Row) => {
    mergeParams('inProcessParameters', {
      SubLglEntL1: row.SubLglEntL1,
      SubLglEntL2: row.SubLglEntL2,
      Process: row.Process,
      SubProcess: row.SubProcess,
      Gjahr: row.FinancialYear,
      Scheduling: row.Scheduling,
      Period: row.Period,
      Action: 'T',
    });
    navTo('inProcessSumry');
  };

  const columns: Column<Row>[] = [
    { key: 'slNo', header: 'Sl No.', width: '3rem' },
    { key: 'Location', header: 'Location' },
    { key: 'Process', header: 'Process' },
    { key: 'FinancialYear', header: 'Year' },
    { key: 'Period', header: 'Month' },
    { key: 'Performer', header: 'Performer' },
    { key: 'Reviewer', header: 'Reviewer' },
    { key: 'AcceptBegda', header: 'Accepted Start Date', render: (r) => formatDateDisplay(r.AcceptBegda) },
    { key: 'AcceptEndda', header: 'Accepted End Date', render: (r) => formatDateDisplay(r.AcceptEndda) },
    {
      key: '__action',
      header: 'Action',
      render: (r) => (
        <button
          type="button"
          aria-label="View"
          onClick={(e) => {
            e.stopPropagation();
            handleInProgressNextScreenPress(r);
          }}
          className="rounded-md p-1 text-rust hover:bg-glassRust"
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  // The source lists carry an explicit "" entry; the placeholder option below stands in for it.
  const opt = (list: string[]) => list.filter((v) => v !== '').map((v) => ({ key: v, text: v }));

  return (
    <Page title="Accepted">
      <Card>
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-56">
            {/* change="OnFilterLegal" has no handler in the source controller — selecting only
                changes the key the other filters use. */}
            <Select value={legal} onChange={setLegal} options={opt(legalEntities)} />
          </Field>
          <Field label="Financial Year" className="w-full sm:w-32">
            <Select value={fy} onChange={onFilterFinancialYear} options={opt(financialYears)} placeholder="" />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-56">
            <Select value={se1} onChange={onFilterSubEntity1} options={opt(subEntity1)} placeholder="" />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-56">
            <Select value={se2} onChange={onFilterSubEntity2} options={opt(subEntity2)} placeholder="" />
          </Field>
          <Field label="Scheduling" className="w-full sm:w-56">
            <Select value={se3} onChange={onFilterSubEntity3} options={opt(subEntity3)} placeholder="" />
          </Field>
          <Field label="Performer" className="w-full sm:w-56">
            <Select value={performer} onChange={onFilterPerformer} options={userOptions} placeholder="" />
          </Field>
          <Field label="Reviewer" className="w-full sm:w-56">
            <Select value={reviewer} onChange={onFilterReviewer} options={userOptions} placeholder="" />
          </Field>
        </Toolbar>
      </Card>
      <DataTable
        columns={columns}
        rows={visibleRows}
        selectionMode="MultiSelect"
        selected={selected}
        onSelectionChange={setSelected}
        growingThreshold={10}
        maxHeight="60vh"
      />
    </Page>
  );
}
