// Shared pieces for the Closed / MIS Closed screens and MailProcessDetail — ported from
// closed(.|2Screen).controller.js, MISClosed(2).controller.js and MailProcessDetail.controller.js.
import { F, read, type Filter } from '../../lib/odata';

export type Row = Record<string, any>;

/** auditJsonModel>/Closed2/* — written by closed / MISClosed (handleClosedNextScreenPress) and
 * read by closed2Screen / MISClosed2. auditJsonModel is component-wide in UI5, so it lives in the
 * app's params store under this name. */
export const CLOSED2_PARAMS = 'auditJsonModel.Closed2';

export interface Closed2Params {
  SubLglEntL1?: string;
  SubLglEntL2?: string;
  Process?: string;
  SubProcess?: string;
  Period?: string;
  Scheduling?: string;
  Gjahr?: string;
}

/** ZUSER_MASTERSet (no filter), keeping only IsAuditManager == 'X' — the /Closed/FilterUser* and
 * /Closed2/User lists. */
export async function fetchAuditManagers(): Promise<Row[]> {
  const { results } = await read<Row>('/ZUSER_MASTERSet');
  return results.filter((u) => u.IsAuditManager == 'X');
}

const toBool = (v: unknown) => v == 'X';

const OBSERVATION_FLAGS = [
  'ObservationReportAudRep',
  'ObservationReportMis',
  'ObservationReportAudCom',
  'ObservationReportNone',
  'OsrvtnCatProc',
  'OsrvtnCatCost',
  'OsrvtnCatRegu',
  'OsrvtnCatOthr',
  'OsrvtnScatP1',
  'OsrvtnScatP2',
  'OsrvtnScatP3',
];

// MISClosed2 converts these as well (closed2Screen does not).
const MIS_EXTRA_FLAGS = ['Department1', 'Department2', 'Department3', 'Department4', 'RootCausePe', 'RootCausePr', 'RootCauseTe'];

/** getObservationItem(): ZSTR_MSD_PROCESS_AUDITSet with $expand OBSERVATION/EmailTable and nine
 * EQ filters (Action 'T' for closed2Screen, 'M' for MISClosed2), then the same 'X' -> boolean and
 * Lineitem number-normalisation transforms. */
export async function fetchObservationItems(row: Row, action: 'T' | 'M'): Promise<{ header: Row | undefined; items: Row[] }> {
  const filters: Filter[] = [
    F('SubLglEntL1', 'EQ', row.SubLglEntL1),
    F('SubLglEntL2', 'EQ', row.SubLglEntL2),
    F('Process', 'EQ', row.Process),
    F('SubProcess', 'EQ', row.SubProcess),
    F('Gjahr', 'EQ', row.Gjahr),
    F('Scheduling', 'EQ', row.Scheduling),
    F('Period', 'EQ', row.Period),
    F('Action', 'EQ', action),
    F('Status', 'EQ', row.Status),
  ];
  const { results } = await read<Row>('/ZSTR_MSD_PROCESS_AUDITSet', {
    filters,
    urlParameters: { $expand: 'OBSERVATION/EmailTable' },
  });
  const header = results[0];
  const items: Row[] = header?.OBSERVATION?.results || [];
  const flags = action === 'M' ? [...OBSERVATION_FLAGS, ...MIS_EXTRA_FLAGS] : OBSERVATION_FLAGS;
  for (const item of items) {
    const emailTable: Row[] = item.EmailTable?.results || [];
    for (const e of emailTable) {
      e.PersonResMail = toBool(e.PersonResMail);
      e.OwnerMail = toBool(e.OwnerMail);
    }
    item.EmailTable = emailTable;
    item.Lineitem = Number(String(item.Lineitem)).toString();
    for (const f of flags) item[f] = toBool(item[f]);
  }
  return { header, items };
}

/** getAttachment() on closed2Screen / MISClosed2 — eight EQ filters in one AND group, Annexture
 * 'X' -> boolean. */
export async function fetchAttachmentsFull(row: Row): Promise<Row[]> {
  const { results } = await read<Row>('/ObservationAttachementSet', {
    filters: [
      {
        and: true,
        filters: [
          F('ControlNumber', 'EQ', row.ControlNumber),
          F('Gjahr', 'EQ', row.Gjahr),
          F('SubLglEntL1', 'EQ', row.SubLglEntL1),
          F('SubLglEntL2', 'EQ', row.SubLglEntL2),
          F('Process', 'EQ', row.Process),
          F('Scheduling', 'EQ', row.Scheduling),
          F('Period', 'EQ', row.Period),
          F('SubProcess', 'EQ', row.SubProcess),
        ],
      },
    ],
  });
  return results.map((r) => ({ ...r, Annexture: r.Annexture == 'X' }));
}

/** getAttachment() on MailProcessDetail — only five filters, and no Annexture conversion. */
export async function fetchAttachmentsMail(row: Row): Promise<Row[]> {
  const { results } = await read<Row>('/ObservationAttachementSet', {
    filters: [
      {
        and: true,
        filters: [
          F('ControlNumber', 'EQ', row.ControlNumber),
          F('Gjahr', 'EQ', row.Gjahr),
          F('SubLglEntL1', 'EQ', row.SubLglEntL1),
          F('SubLglEntL2', 'EQ', row.SubLglEntL2),
          F('Process', 'EQ', row.Process),
        ],
      },
    ],
  });
  return results;
}
