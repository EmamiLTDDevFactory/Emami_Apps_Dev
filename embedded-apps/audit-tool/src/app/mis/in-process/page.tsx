'use client';

// MIS - Inprocess — port of the source app's MISinprocess view/controller.
//  - GET ZSTR_MSD_AUD_PROC_LISTSet with $filter Action eq 'M' (the row list, numbered slNo 1..n).
//  - GET ZUSER_MASTERSet (no filter) — IsAuditManager 'X' users feed the Performer/Reviewer selects.
//  - The cascading selects (Legal Entity -> Financial Year -> Sub Entity 1 -> Sub Entity 2 ->
//    Scheduling, plus Performer/Reviewer) filter the table client-side with exactly the multi-filter
//    the source builds in onFilterFinancialYear/onFilterSubEntity1/2/3/onFilterPerformer/Reviewer.
//  - The row's view button stores the row into inProcessParameters (Action 'M') and navigates to
//    MISinprocessSmry.
import { useEffect, useMemo, useState } from 'react';
import { Page, Card, Toolbar, Field, Select, DataTable, formatDateDisplay, uniqueBy, type Option, type Column } from '../../../components/ui';
import HeaderClock from '../../../components/mis-inprocess/HeaderClock';
import { useUi } from '../../../context/UiContext';
import { useApp } from '../../../context/AppContext';
import { useNavTo } from '../../../lib/routes';
import { read, F, And, Or, applyFilters, type Filter } from '../../../lib/odata';
import { Eye } from 'lucide-react';

type Row = Record<string, any>;

/** new Filter({ filters: [new Filter({ filters: [new Filter(path, EQ, v)], and: false })], and: true }) building block */
const orOne = (path: string, value: unknown) => Or([F(path, 'EQ', value)]);

function keyOptions(rows: Row[], key: string): Option[] {
  return rows.map((r) => ({ key: String(r[key] ?? ''), text: String(r[key] ?? '') }));
}

export default function MisInProcessPage() {
  const ui = useUi();
  const { mergeParams } = useApp();
  const navTo = useNavTo();

  const [rows, setRows] = useState<Row[]>([]);
  const [data, setData] = useState<Row[]>([]); // auditJsonModel>/InProcess/Data
  const [legalEntities, setLegalEntities] = useState<Row[]>([]);
  const [financialYears, setFinancialYears] = useState<Row[]>([]);
  const [subEntity1, setSubEntity1] = useState<Row[]>([]);
  const [subEntity2, setSubEntity2] = useState<Row[]>([]);
  const [subEntity3, setSubEntity3] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]); // /InProcess/FilterUserPerformer (= FilterUserReviewer)

  const [le, setLe] = useState('');
  const [fy, setFy] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [se3, setSe3] = useState('');
  const [perf, setPerf] = useState('');
  const [rev, setRev] = useState('');
  const [tableFilter, setTableFilter] = useState<Filter | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    read<Row>('/ZSTR_MSD_AUD_PROC_LISTSet', { filters: [And([F('Action', 'EQ', 'M')])] })
      .then(({ results }) => {
        let serialNo = 1;
        results.forEach((obj) => {
          obj.slNo = serialNo++;
        });
        setRows(results);
        if (results.length > 0) setData(results);

        const leRef = uniqueBy(results, 'LglEnt');
        if (leRef.length > 0) {
          const list = leRef.map((r) => ({ LglEnt: r.LglEnt }));
          setLegalEntities(list);
          // forceSelection="true": the first legal entity is pre-selected
          setLe(String(list[0].LglEnt ?? ''));
        }
        const fyRef = uniqueBy(results, 'FinancialYear');
        if (fyRef.length > 0) {
          setFinancialYears([...fyRef.map((r) => ({ FinancialYear: r.FinancialYear })), { FinancialYear: '' }]);
        }
      })
      .catch(() => {
        /* source error handler is empty */
      });

    read<Row>('/ZUSER_MASTERSet')
      .then(({ results }) => setUsers(results.filter((u) => u.IsAuditManager == 'X')))
      .catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilterFinancialYear = (key: string) => {
    setFy(key);
    const f1 = data.filter((d) => d.FinancialYear == key);
    setSubEntity1([...uniqueBy(f1, 'SubLglEntL1'), { SubLglEntL1: '' }]);
    setSe1('');
    setSe2('');
    setSe3('');
    setPerf('');
    setRev('');
    const filters: Filter[] = [orOne('LglEnt', le)];
    if (key != '') filters.push(orOne('FinancialYear', key));
    setTableFilter(And(filters));
  };

  const onFilterSubEntity1 = (key: string) => {
    setSe1(key);
    const f1 = data.filter((d) => d.SubLglEntL1 == key);
    setSubEntity2([...uniqueBy(f1, 'SubLglEntL2'), { SubLglEntL2: '' }]);
    setSe2('');
    setSe3('');
    setPerf('');
    setRev('');
    const filters: Filter[] = [orOne('LglEnt', le), orOne('FinancialYear', fy)];
    if (key != '') filters.push(orOne('SubLglEntL1', key));
    setTableFilter(And(filters));
  };

  const onFilterSubEntity2 = (key: string) => {
    setSe2(key);
    const f1 = data.filter((d) => d.SubLglEntL2 == key);
    setSubEntity3([...uniqueBy(f1, 'Scheduling'), { Scheduling: '' }]);
    setSe3('');
    setPerf('');
    setRev('');
    const filters: Filter[] = [orOne('LglEnt', le), orOne('FinancialYear', fy), orOne('SubLglEntL1', se1)];
    if (key != '') filters.push(orOne('SubLglEntL2', key));
    setTableFilter(And(filters));
  };

  const onFilterSubEntity3 = (key: string) => {
    setSe3(key);
    const filters: Filter[] = [orOne('LglEnt', le), orOne('FinancialYear', fy), orOne('SubLglEntL1', se1), orOne('SubLglEntL2', se2)];
    if (key != '') filters.push(orOne('Scheduling', key));
    setTableFilter(And(filters));
    setPerf('');
    setRev('');
  };

  const onFilterPerformer = (key: string) => {
    setPerf(key);
    const filters: Filter[] = [orOne('LglEnt', le)];
    if (fy != '') filters.push(orOne('FinancialYear', fy));
    if (se1 != '') filters.push(orOne('SubLglEntL1', se1));
    if (se2 != '') filters.push(orOne('SubLglEntL2', se2));
    if (rev != '') filters.push(orOne('Reviewer', rev));
    if (key != '') filters.push(orOne('Performer', key));
    setTableFilter(And(filters));
  };

  const onFilterReviewer = (key: string) => {
    setRev(key);
    const filters: Filter[] = [orOne('LglEnt', le)];
    if (fy != '') filters.push(orOne('FinancialYear', fy));
    if (se1 != '') filters.push(orOne('SubLglEntL1', se1));
    if (se2 != '') filters.push(orOne('SubLglEntL2', se2));
    if (perf != '') filters.push(orOne('Performer', perf));
    if (key != '') filters.push(orOne('Reviewer', key));
    setTableFilter(And(filters));
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
      Action: 'M',
    });
    navTo('MISinprocessSmry');
  };

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);
  useEffect(() => setSelected(new Set()), [tableFilter]);

  const userOptions: Option[] = users.map((u) => {
    const name = `${u.Fname ?? ''} ${u.Lname ?? ''}`;
    return { key: name, text: name };
  });

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
      key: 'action',
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

  return (
    <Page title="MIS - Inprocess" actions={<HeaderClock />}>
      <Card>
        <Toolbar>
          <Field label="Legal Entity" className="w-full sm:w-56">
            {/* OnFilterLegal is not defined in the source controller — changing it only changes the key
                later filters read. */}
            <Select value={le} onChange={setLe} options={keyOptions(legalEntities, 'LglEnt')} />
          </Field>
          <Field label="Financial Year" className="w-full sm:w-32">
            <Select value={fy} onChange={onFilterFinancialYear} options={keyOptions(financialYears, 'FinancialYear')} />
          </Field>
          <Field label="Sub Entity 1" className="w-full sm:w-56">
            <Select value={se1} onChange={onFilterSubEntity1} options={keyOptions(subEntity1, 'SubLglEntL1')} />
          </Field>
          <Field label="Sub Entity 2" className="w-full sm:w-56">
            <Select value={se2} onChange={onFilterSubEntity2} options={keyOptions(subEntity2, 'SubLglEntL2')} />
          </Field>
          <Field label="Scheduling" className="w-full sm:w-56">
            <Select value={se3} onChange={onFilterSubEntity3} options={keyOptions(subEntity3, 'Scheduling')} />
          </Field>
          <Field label="Performer" className="w-full sm:w-56">
            <Select value={perf} onChange={onFilterPerformer} options={userOptions} placeholder="" />
          </Field>
          <Field label="Reviewer" className="w-full sm:w-56">
            <Select value={rev} onChange={onFilterReviewer} options={userOptions} placeholder="" />
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
