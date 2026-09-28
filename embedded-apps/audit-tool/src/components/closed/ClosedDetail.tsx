'use client';

// closed2Screen.controller.js / MISClosed2.controller.js (+ views). Identical except: the
// ZSTR_MSD_PROCESS_AUDITSet list and observation reads use Action 'T' vs 'M', MISClosed2 converts
// the Department1-4 / RootCausePe|Pr|Te flags too, uses the MIS observation display dialog, and
// "Back" returns to MISClosed instead of closed.
import React, { useEffect, useMemo, useState } from 'react';
import { Eye } from 'lucide-react';
import { Page, Card, Select, DataTable, uniqueBy, type Option } from '../ui';
import { useApp } from '../../context/AppContext';
import { useUi } from '../../context/UiContext';
import { useNavTo } from '../../lib/routes';
import { And, F, applyFilters, read, type Filter } from '../../lib/odata';
import { Clock, ClosedActionDialog, ObservationDisplayDialog } from './Dialogs';
import { CLOSED2_PARAMS, fetchAttachmentsFull, fetchAuditManagers, fetchObservationItems, type Closed2Params, type Row } from './shared';

type Variant = 'closed' | 'mis';

function opts(rows: Row[], key: string): Option[] {
  return rows.filter((r) => String(r[key] ?? '') !== '').map((r) => ({ key: String(r[key]), text: String(r[key]) }));
}

export default function ClosedDetail({ variant }: { variant: Variant }) {
  const { getParams } = useApp();
  const ui = useUi();
  const navTo = useNavTo();
  const action = variant === 'closed' ? 'T' : 'M';

  const [rows, setRows] = useState<Row[]>([]);
  const [legal, setLegal] = useState('');
  const [se1, setSe1] = useState('');
  const [se2, setSe2] = useState('');
  const [se2OptionFilter, setSe2OptionFilter] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<Filter[] | undefined>(undefined);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Dialog state (AuditModel + auditJsonModel>/ClosedAction/* + /InProcess2/*)
  const [audit, setAudit] = useState<Row | null>(null);
  const [status, setStatus] = useState('');
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [observationItems, setObservationItems] = useState<Row[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [personOwnerRows, setPersonOwnerRows] = useState<Row[]>([]);

  useEffect(() => {
    const p = getParams<Closed2Params>(CLOSED2_PARAMS);
    read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', {
      filters: [
        And([
          F('SubLglEntL1', 'EQ', p.SubLglEntL1),
          F('SubLglEntL2', 'EQ', p.SubLglEntL2),
          F('Process', 'EQ', p.Process),
          F('SubProcess', 'EQ', p.SubProcess),
          F('Gjahr', 'EQ', p.Gjahr),
          F('Scheduling', 'EQ', p.Scheduling),
          F('Period', 'EQ', p.Period),
          F('Action', 'EQ', action),
        ]),
      ],
    })
      .then(({ results }) => {
        results.forEach((r, i) => {
          r.slNo = i + 1;
        });
        setRows(results);
        const le = uniqueBy(results, 'LglEnt');
        setLegal(le.length > 0 ? String(le[0].LglEnt ?? '') : ''); // forceSelection="true"
      })
      .catch(() => {
        /* source error handler is empty */
      });

    // Fills auditJsonModel>/Closed2/User in the source; nothing visible binds to it.
    fetchAuditManagers().catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const legalOptions = opts(uniqueBy(rows, 'LglEnt'), 'LglEnt');
  const se1Options = opts(uniqueBy(rows, 'SubLglEntL1'), 'SubLglEntL1');
  const se2Options = opts(
    se2OptionFilter === null ? uniqueBy(rows, 'SubLglEntL2') : applyFilters(uniqueBy(rows, 'SubLglEntL2'), [F('SubLglEntL1', 'EQ', se2OptionFilter)]),
    'SubLglEntL2',
  );

  /** handleCommonFilterFunction */
  const applyCommon = (le: string, s1: string, s2: string) => {
    const arr: Filter[] = [];
    if (le != 'Legal Entity' && le != '') arr.push(F('LglEnt', 'EQ', le));
    if (s1 != 'Sub Entity 1' && s1 != '') arr.push(F('SubLglEntL1', 'EQ', s1));
    if (s2 != 'Process' && s2 != '') arr.push(F('SubLglEntL2', 'EQ', s2));
    if (arr.length == 0) setTableFilter([]);
    else if (arr.length == 1) setTableFilter(arr);
    else setTableFilter([And(arr)]);
  };

  const handleChangeSubEntity1 = (key: string) => {
    setSe1(key);
    if (key != 'Sub Entity 1') {
      setSe2OptionFilter(key);
      setSe2('');
      applyCommon(legal, key, '');
    } else {
      setSe2OptionFilter(null);
      applyCommon(legal, key, se2);
    }
  };

  const visibleRows = useMemo(() => applyFilters(rows, tableFilter), [rows, tableFilter]);
  useEffect(() => setSelected(new Set()), [visibleRows]);

  const handleLineItemPress = async (row: Row) => {
    ui.busy(true);
    setAudit({ ...row });
    setStatus(row.Status ?? '');
    setAttachments([]);

    fetchAttachmentsFull(row)
      .then(setAttachments)
      .catch(() => ui.messageBox.error('Internal Server error'));

    try {
      const { items } = await fetchObservationItems(row, action);
      setObservationItems(items);
      setActionOpen(true);
    } catch {
      ui.messageBox.error('Internal Server error');
    } finally {
      ui.busy(false);
    }
  };

  const onPressDisplayObservation = (item: Row) => {
    setDetail(item);
    const match = observationItems.filter((i) => i.Lineitem == item.Lineitem).pop();
    if (match) setPersonOwnerRows(match.EmailTable || []);
  };

  return (
    <Page title={variant === 'closed' ? 'Closed' : 'MIS Closed Subprocess'} actions={<Clock />}>
      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            className="w-full sm:w-56"
            value={legal}
            onChange={(k) => {
              setLegal(k);
              applyCommon(k, se1, se2);
            }}
            options={legalOptions}
          />
          <Select className="w-full sm:w-56" value={se1} onChange={handleChangeSubEntity1} options={se1Options} placeholder="Sub Entity 1" />
          <Select
            className="w-full sm:w-56"
            value={se2}
            onChange={(k) => {
              setSe2(k);
              applyCommon(legal, se1, k);
            }}
            options={se2Options}
            placeholder="Sub Entity 2"
          />
          <button type="button" className="btn-primary" onClick={() => navTo(variant === 'closed' ? 'closed' : 'MISClosed')}>
            Back
          </button>
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
          { key: 'Process', header: 'Process' },
          { key: 'SubProcess', header: 'Sub Process' },
          { key: 'AuditSteps', header: 'Audit Steps', className: 'whitespace-pre-wrap' },
          {
            key: 'action',
            header: 'Action',
            render: (r) => (
              <button type="button" aria-label="View" className="p-1 text-rust hover:text-rustDeep" onClick={() => handleLineItemPress(r)}>
                <Eye size={16} />
              </button>
            ),
          },
        ]}
      />

      <ClosedActionDialog
        open={actionOpen}
        audit={audit}
        status={status}
        observationItems={observationItems}
        attachments={attachments}
        onDisplayObservation={onPressDisplayObservation}
        onClose={() => setActionOpen(false)}
      />
      <ObservationDisplayDialog
        open={detail !== null}
        detail={detail}
        personOwnerRows={personOwnerRows}
        mis={variant === 'mis'}
        onClose={() => setDetail(null)}
      />
    </Page>
  );
}
