'use client';

// MIS Process Summary — port of the source app's MISinprocessSmry view/controller.
//  - GET ZSTR_MSD_COUNTSet with one AND multi-filter built from inProcessParameters
//    (SubLglEntL1, SubLglEntL2, Process, SubProcess, FinancialYear = /Gjahr, Scheduling, Period,
//    Action) — the per-process status counts.
//  - GET ZUSER_MASTERSet (result not shown on this screen; issued exactly like the source).
//  - Each count link writes the row + a Status (TotalProc '', SendToReviewer 'Send to Reviewer',
//    SendToPerformer 'Send Back to Performer', SendToAuditee 'Send to Auditee', ManagementResp
//    'Management Responded', ObservnCount 'Obext', Closed 'MIS Close') into inProcessParameters
//    with Action 'M', then navigates to MISinprocess2.
import { useEffect, useState } from 'react';
import { Page, DataTable, Link, type Column } from '../../../../components/ui';
import HeaderClock from '../../../../components/mis-inprocess/HeaderClock';
import { useUi } from '../../../../context/UiContext';
import { useApp } from '../../../../context/AppContext';
import { useNavTo } from '../../../../lib/routes';
import { read, F, And } from '../../../../lib/odata';

type Row = Record<string, any>;

const LINK_STATUS: Record<string, string> = {
  TotalProc: '',
  SendToReviewer: 'Send to Reviewer',
  SendToPerformer: 'Send Back to Performer',
  SendToAuditee: 'Send to Auditee',
  ManagementResp: 'Management Responded',
  ObservnCount: 'Obext',
  Closed: 'MIS Close',
};

export default function MisInProcessSummaryPage() {
  const ui = useUi();
  const { getParams, mergeParams } = useApp();
  const navTo = useNavTo();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const p = getParams<Row>('inProcessParameters');
    const filters = And([
      F('SubLglEntL1', 'EQ', p.SubLglEntL1),
      F('SubLglEntL2', 'EQ', p.SubLglEntL2),
      F('Process', 'EQ', p.Process),
      F('SubProcess', 'EQ', p.SubProcess),
      F('FinancialYear', 'EQ', p.Gjahr),
      F('Scheduling', 'EQ', p.Scheduling),
      F('Period', 'EQ', p.Period),
      F('Action', 'EQ', p.Action),
    ]);
    read<Row>('/ZSTR_MSD_COUNTSet', { filters: [filters] })
      .then(({ results }) => setRows(results))
      .catch(() => {
        /* source error handler is empty */
      });

    read<Row>('/ZUSER_MASTERSet').catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPresslineItem = (row: Row, linkType: string) => {
    mergeParams('inProcessParameters', {
      SubLglEntL1: row.SubLglEntL1,
      SubLglEntL2: row.SubLglEntL2,
      Process: row.Process,
      SubProcess: row.SubProcess,
      Gjahr: row.FinancialYear,
      Scheduling: row.Scheduling,
      Period: row.Period,
      Action: 'M',
      ...(linkType in LINK_STATUS ? { Status: LINK_STATUS[linkType] } : {}),
    });
    navTo('MISinprocess2');
  };

  const linkCol = (key: string, header: string): Column<Row> => ({
    key,
    header,
    render: (r) => <Link onClick={() => onPresslineItem(r, key)}>{String(r[key] ?? '')}</Link>,
  });

  const columns: Column<Row>[] = [
    { key: 'Process', header: 'Process', width: '18rem' },
    linkCol('TotalProc', 'Total'),
    linkCol('SendToReviewer', 'Send To Reviewer'),
    linkCol('SendToPerformer', 'Back To Performer'),
    linkCol('SendToAuditee', 'Send To Auditee'),
    linkCol('ManagementResp', 'Management Responded'),
    linkCol('ObservnCount', 'Observation Count'),
    linkCol('Closed', 'MIS Closed'),
  ];

  return (
    <Page title="MIS Process Summary" actions={<HeaderClock />}>
      <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="60vh" />
    </Page>
  );
}
