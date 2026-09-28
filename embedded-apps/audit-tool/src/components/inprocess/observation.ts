// Observation-line conversions shared by the In Process observation screen (port of
// inProcess2Screen.controller.js). SAP stores the checkbox-style flags as 'X' / '' and the
// Person/Owner mail flags the same way; the screen edits them as booleans. These two functions are
// the controller's own read-side loop (getObservationItem success) and its save-side fnLogic.

export type Row = Record<string, any>;

/** Flags the Fiori code flips between 'X' and boolean on every observation line. */
export const OBSERVATION_FLAGS = [
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
] as const;

/** getObservationItem's success loop: unwrap the expanded EmailTable collection, turn 'X' flags
 * into booleans, and normalise Lineitem through Number() (drops leading zeros). */
export function observationFromSap(raw: Row): Row {
  const item: Row = { ...raw };
  const emailTable: Row[] | undefined = raw.EmailTable?.results;
  item.EmailTable = emailTable
    ? emailTable.map((e) => ({ ...e, PersonResMail: e.PersonResMail === 'X', OwnerMail: e.OwnerMail === 'X' }))
    : undefined;
  item.Lineitem = Number(String(raw.Lineitem)).toString();
  for (const f of OBSERVATION_FLAGS) item[f] = raw[f] === 'X';
  return item;
}

/** onPressSave's fnLogic, applied to a copy: booleans back to 'X' / '', and every EmailTable row
 * gets its parent's Lineitem. Returns null when a line misses a required field
 * (BusinessImplication / RootCause / Recommendation) — the caller shows the same error the Fiori
 * app does. */
export function observationToSap(src: Row): Row | null {
  if (!src.BusinessImplication || !src.RootCause || !src.Recommendation) return null;
  const item: Row = { ...src };
  for (const f of OBSERVATION_FLAGS) item[f] = src[f] === true ? 'X' : '';
  if (src.EmailTable) {
    item.EmailTable = (src.EmailTable as Row[]).map((e) => {
      const row: Row = { ...e };
      if (src.Lineitem) row.Lineitem = src.Lineitem;
      row.PersonResMail = e.PersonResMail ? 'X' : '';
      row.OwnerMail = e.OwnerMail ? 'X' : '';
      return row;
    });
  }
  return item;
}

/** Wire-format (no conversion needed) copy of an expanded observation line as SAP returned it —
 * used by the multi-row "Alter Status" path, which re-posts each row's own observations. */
export function observationPassthrough(raw: Row): Row {
  const item: Row = { ...raw };
  const emailTable: Row[] | undefined = raw.EmailTable?.results;
  if (emailTable) item.EmailTable = emailTable.map((e) => ({ ...e }));
  else delete item.EmailTable;
  return item;
}

/** onAddNewObervation's blank line. */
export function newObservation(lineitem: string): Row {
  return {
    ObsrvnGuid: '',
    Lineitem: lineitem,
    FinancialYear: '',
    ObservationTitle: '',
    Observation: '',
    BusinessImplication: '',
    RootCause: '',
    FinancialImpact: '',
    Recommendation: '',
    ManagementResponse: '',
    Timeline: null,
    DirectClose: '',
    Score: '',
    PersonResponsible: '',
    PersonResUname: '',
    OwnerName: '',
    OwnerUname: '',
    GrossRisk: '',
    ResidualRisk: '',
  };
}

/** onAddPersonAndOwner's blank Person Responsible / Owner row. */
export function newPersonOwner(owLineitem: string): Row {
  return {
    Lineitem: '',
    OwLineitem: owLineitem,
    PersonResponsible: '',
    PersonResUname: '',
    PersonResMail: false,
    PersonResComment: '',
    OwnerName: '',
    OwnerUname: '',
    OwnerMail: false,
    OwnerComment: '',
  };
}
