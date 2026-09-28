'use client';

// Process Summary — port of the Fiori inProcessSumry view/controller. Status counts per process
// (ZSTR_MSD_COUNTSet) for the process picked on Accepted; each count links into the observation
// screen with inProcessParameters>/Status set to that bucket.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../../../context/AppContext';
import { useUi } from '../../../../context/UiContext';
import { And, F, read } from '../../../../lib/odata';
import { useNavTo } from '../../../../lib/routes';
import { DataTable, Link, Page, type Column } from '../../../../components/ui';

type Row = Record<string, any>;

/** onPresslineItem's linkType -> inProcessParameters>/Status */
const STATUS_BY_LINK: Record<string, string> = {
  TotalProc: '',
  SendToReviewer: 'Send to Reviewer',
  SendToPerformer: 'Send Back to Performer',
  SendToAuditee: 'Send to Auditee',
  ManagementResp: 'Management Responded',
  ObservnCount: 'Obext',
  Closed: 'Close',
};

export default function ProcessSummaryPage() {
  const { getParams, mergeParams } = useApp();
  const ui = useUi();
  const navTo = useNavTo();
  const loaded = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const model = getParams<Row>('inProcessParameters');
    const filters = And([
      F('SubLglEntL1', 'EQ', model.SubLglEntL1),
      F('SubLglEntL2', 'EQ', model.SubLglEntL2),
      F('Process', 'EQ', model.Process),
      F('SubProcess', 'EQ', model.SubProcess),
      F('FinancialYear', 'EQ', model.Gjahr),
      F('Scheduling', 'EQ', model.Scheduling),
      F('Period', 'EQ', model.Period),
      F('Action', 'EQ', model.Action),
    ]);
    read<Row>('/ZSTR_MSD_COUNTSet', { filters: [filters] })
      .then(({ results }) => setRows(results))
      .catch(() => {
        /* the Fiori error handler is empty */
      });

    // Same user read as the source (it fills auditJsonModel>/InProcess/FilterUserPerformer, which
    // no control on this screen displays).
    read<Row>('/ZUSER_MASTERSet')
      .then(() => undefined)
      .catch(() => ui.messageBox.error('Internal Server error'));
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
      Action: 'T',
      Status: STATUS_BY_LINK[linkType],
    });
    navTo('inProcess2Screen');
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
    linkCol('Closed', 'Closed'),
  ];

  return (
    <Page title="Process Summary">
      <DataTable columns={columns} rows={rows} growingThreshold={10} maxHeight="65vh" />
    </Page>
  );
}
