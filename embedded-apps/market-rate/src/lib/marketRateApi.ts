// SAP OData integration for Market Rate — deliberately isolated in this one file so the rest of
// the app (the table screen, hub session pickup, save button) works today and only this file
// needs filling in once SAP/Basis hand over the real service details.
//
// TODO(SAP): this app has NO SAP OData service wired up yet. Every other embedded app in this
// repo (see e.g. embedded-apps/rc-portal/src/services/odataService.js or
// embedded-apps/non-ctc-expense/src/config/api.ts) points at a specific, already-provisioned
// SAP service — e.g. ".../api/NGD/ZRCPORTAL_SRV" — that Basis explicitly opened anonymous access
// to per entity set. There is no equivalent service for material market rates yet. Once one
// exists, fill in:
//   1. SAP_BASE_URL below (which gateway host + environment: NGD/NGQ/NWP + service name)
//   2. ENTITY_SET (the OData entity set name, e.g. 'ZMM_MARKETRATESet')
//   3. toSapPayload/fromSapRow (the real SAP field names — SAP uses technical codes like MATNR,
//      not "materialCode" — swap the placeholder keys below for the real ones)
// Until then, saveMarketRates() below throws a clear, user-facing error instead of silently
// failing or sending garbage to a URL that doesn't exist.
import axios from 'axios';

const SAP_BASE_URL = ''; // e.g. 'https://emamiapi.emamigroup.com/api/NGD/ZMM_MARKETRATE_SRV'
const ENTITY_SET = ''; // e.g. 'ZMM_MARKETRATESet'

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json' },
});

export interface MarketRateRow {
  /** Local-only row id (table editing key) — never sent to SAP. */
  key: string;
  materialCode: string;
  marketRate: string;
  validFrom: string; // ISO yyyy-mm-dd
}

function isConfigured(): boolean {
  return Boolean(SAP_BASE_URL && ENTITY_SET);
}

// SAP typically wants date fields as "/Date(<epoch-ms>)/" in its JSON OData format, not a plain
// ISO string — kept as a separate step so it's obvious this needs revisiting once the real field
// names/formats are confirmed against the actual service (SAP's date handling varies by service).
function toSapPayload(row: MarketRateRow, createdBy: string | null) {
  return {
    // TODO(SAP): replace these placeholder keys with the real field names once known.
    MaterialCode: row.materialCode,
    MarketRate: row.marketRate,
    ValidFrom: row.validFrom,
    CreatedBy: createdBy || '',
  };
}

export async function saveMarketRates(rows: MarketRateRow[], createdBy: string | null): Promise<void> {
  if (!isConfigured()) {
    throw new Error(
      'Market Rate is not connected to SAP yet — ask IT to provide the OData service details.'
    );
  }
  for (const row of rows) {
    const payload = toSapPayload(row, createdBy);
    const result = await sapClient.post(`/${ENTITY_SET}`, payload);
    // SAP's OData gateway sometimes returns HTTP 200 with an error body instead of a non-2xx
    // status — same convention every other embedded app in this repo checks for.
    if (result.data?.Type === 'E' || result.data?.d?.Type === 'E') {
      const message = result.data?.Message || result.data?.d?.Message || 'SAP rejected this row.';
      throw new Error(`${row.materialCode || 'Row'}: ${message}`);
    }
  }
}
