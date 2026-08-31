// SAP OData integration for Market Rate. One POST per save, a "deep insert" into the header
// entity with every row nested under ToMarketRates — SAP creates the header row and all its line
// items in a single call, sharing one RateId (a randomly generated batch id, not user-entered).
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_MARKET_RATE_SRV';
const ENTITY_SET = 'ZMarketRateHeaderSet';
// Materials the signed-in user is already associated with — pre-fills the table on load instead
// of starting blank. Verified live: entity set is ZMarketSuppDataSet (not ZMarketSuppData), Email
// is the filter field (not a plain key — this returns a real list of rows per email).
const SUPPLIER_DATA_ENTITY_SET = 'ZMarketSuppDataSet';
// NOT yet verified live (unlike the two entity sets above) — built from the shape the Dashboard/
// role feature was specified against. Confirm the entity name, that Email is a valid key, and that
// it returns a literal 'Admin'/'User' string in Role before relying on this in production.
const ROLE_ENTITY_SET = 'ZMarketRoleSet';
// Master Data upload target (Dashboard's Master Data screen, Admin-only) — a media-resource
// entity backed by DPC method create_stream, WHEN 'SupplierMatUpload'. Confirmed live from that
// ABAP: it writes to ZMM_SUPL_MAT_MAP (same table ZMarketSuppDataSet reads from), only accepts
// .xlsx, and expects the POST body to be the file's raw base64 TEXT (not JSON) — the handler does
// convert_from → strip a "data:...;base64," prefix if present → decode_x_base64. Only the entity
// SET name (vs. the confirmed entity TYPE name 'SupplierMatUpload') is inferred here, via this
// service's own "TypeName + Set" convention (ZMarketRateHeaderSet, ZMarketSuppDataSet, etc.).
const SUPPLIER_MAT_UPLOAD_ENTITY_SET = 'SupplierMatUploadSet';

// Not exposed in the form — sent blank per instruction, not defaulted to any particular company.
const DEFAULT_COMPANY_CODE = '';

const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

export interface MarketRateRow {
  /** Local-only row id (table editing key) — never sent to SAP. */
  key: string;
  materialCode: string;
  materialDesc: string;
  materialType: string;
  marketName: string;
  marketRate: string;
  ratePer: string;
  igst: string;
  sgst: string;
  cgst: string;
  validFrom: string; // yyyy-mm-dd
  /** Read-only context from ZMarketSuppDataSet (supplier code/name, contact, as-of date) — shown
   * for reference, not sent back to SAP on save (no field for it in the save payload). */
  supplierRef?: string;
  /** True for rows pre-filled from ZMarketSuppDataSet — material code/description/type are SAP
   * reference data there, not something a user should be free to overwrite by hand. Rows added via
   * "Add row" stay false/editable, since there's no lookup UI to fill those fields any other way. */
  locked?: boolean;
  /** Set only on rows loaded back from SAP (Dashboard's edit flow) — the header RateId this row's
   * batch was originally saved under. Edited rows are grouped by this and re-posted with the same
   * RateId so the save reuses/updates the existing batch instead of minting a new one. Absent on
   * rows created fresh in the Home form. */
  rateId?: string;
  /** Set only on rows loaded back from SAP — the email the batch was originally submitted under.
   * Preserved on save so an Admin editing another user's row doesn't reassign it to themselves. */
  email?: string;
}

export interface SuppliedMaterial {
  materialCode: string;
  materialDesc: string;
  materialType: string;
  rateUom: string;
  supplierCode: string;
  supplierName: string;
  contact: string;
  asOfDate: string;
}

/** Loads the materials already associated with this email (ZMarketSuppDataSet, filtered by
 * Email) — used to pre-fill the table on page load instead of starting from blank rows.
 * Best-effort: an empty/failed result just means the table starts blank, same as before this
 * existed — nothing about saving depends on this succeeding. */
export async function fetchSuppliedMaterials(email: string): Promise<SuppliedMaterial[]> {
  try {
    const { data } = await sapClient.get(`/${SUPPLIER_DATA_ENTITY_SET}`, {
      params: { '$filter': `Email eq '${email}'`, '$format': 'json' },
    });
    const results = data?.d?.results;
    if (!Array.isArray(results)) return [];
    return results.map((r: any) => ({
      materialCode: r.Matnr || '',
      materialDesc: r.Maktx || '',
      materialType: r.Mtart || '',
      rateUom: r.Meins || '',
      supplierCode: r.Lifnr || '',
      supplierName: r.Name1 || '',
      contact: r.Contact || '',
      asOfDate: r.Datum || '',
    }));
  } catch {
    return [];
  }
}

/** Looks up the signed-in user's role for the sidebar/Dashboard gating. Fails closed to 'User'
 * (least privilege) on any lookup error or missing record, rather than throwing — a role check
 * that can't reach SAP should never silently grant Admin. */
export async function fetchUserRole(email: string): Promise<'Admin' | 'User'> {
  try {
    const { data } = await sapClient.get(`/${ROLE_ENTITY_SET}(Email='${email}')`, {
      params: { '$format': 'json' },
    });
    const record = data?.d?.results ? data.d.results[0] : data?.d;
    return record?.Role === 'Admin' ? 'Admin' : 'User';
  } catch {
    return 'User';
  }
}

/** Loads existing market rate entries for the Dashboard's edit flow. Server-side filters by Email
 * (a header-level field — see the save-side note in saveMarketRates) when one is passed; omit it
 * to fetch every submitter's rows, which is how an Admin sees everyone's rates for a year.
 *
 * Year itself is filtered client-side against each line item's Zyear after the fetch, not via
 * server-side $filter: Zyear only exists on line items (ToMarketRates), and SAP's OData v2 gateway
 * doesn't support filtering a parent set by a nested collection's fields. Filtering post-fetch is
 * the safe option that doesn't depend on assuming a header-level Zyear field exists. */
export async function fetchMarketRates(year: string, opts: { email?: string } = {}): Promise<MarketRateRow[]> {
  const params: Record<string, string> = { '$expand': 'ToMarketRates', '$format': 'json' };
  if (opts.email) params['$filter'] = `Email eq '${opts.email}'`;

  const { data } = await sapClient.get(`/${ENTITY_SET}`, { params });
  const headers = data?.d?.results;
  if (!Array.isArray(headers)) return [];

  const rows: MarketRateRow[] = [];
  for (const header of headers) {
    const rateId: string = header.RateId;
    const email: string | undefined = header.Email || undefined;
    const lineItems = header.ToMarketRates?.results;
    if (!Array.isArray(lineItems)) continue;
    for (const li of lineItems) {
      if (String(li.Zyear ?? '') !== String(year)) continue;
      rows.push({
        key: `${rateId}-${li.Matnr}-${li.Zdate}`,
        rateId,
        email,
        materialCode: li.Matnr || '',
        materialDesc: li.Maktx || '',
        materialType: li.Mtart || '',
        marketName: li.ZmarketName || '',
        marketRate: li.Zrate != null ? String(li.Zrate) : '',
        ratePer: li.ZratePer || '',
        igst: li.Igst != null ? String(li.Igst) : '',
        sgst: li.Sgst != null ? String(li.Sgst) : '',
        cgst: li.Cgst != null ? String(li.Cgst) : '',
        validFrom: li.Zdate ? String(li.Zdate).split('T')[0] : '',
        // Material identity is SAP reference data here too, same as the Home form's pre-filled
        // rows — only the rate/tax/date fields make sense to hand-edit.
        locked: true,
      });
    }
  }
  return rows;
}

export interface MasterDataFile {
  fileName: string;
  /** Base64-encoded file bytes, no "data:...;base64," prefix — this IS the POST body, not a field
   * inside a JSON payload (see create_stream's convert_from/decode_x_base64 handling). */
  base64: string;
}

export interface MasterDataUploadResult {
  message: string;
  recordCount: number;
}

/** Uploads an .xlsx to the SupplierMatUpload media-resource entity. Unlike saveMarketRates, this
 * endpoint raises a real business exception on failure (RAISE EXCEPTION TYPE
 * /iwbep/cx_mgw_busi_exception), so SAP responds with a normal non-2xx OData v2 error body
 * ({ error: { message: { value } } }) rather than 200-with-Type=E — errors are caught and
 * re-thrown from that shape here instead. */
export async function uploadMasterDataFile(file: MasterDataFile): Promise<MasterDataUploadResult> {
  try {
    const result = await sapClient.post(`/${SUPPLIER_MAT_UPLOAD_ENTITY_SET}`, file.base64, {
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        // Filename travels via the Slug header (AtomPub media-resource convention) — the server
        // unescapes it with cl_http_utility=>unescape_url, so URL-encode it here to match.
        Slug: encodeURIComponent(file.fileName),
      },
      params: { '$format': 'json' },
    });
    const body = result.data?.d || result.data;
    return {
      message: body?.Message || 'Upload complete.',
      recordCount: Number(body?.Recordcount ?? 0),
    };
  } catch (err: any) {
    const sapMessage = err?.response?.data?.error?.message?.value;
    throw new Error(sapMessage || (err instanceof Error ? err.message : 'Could not upload this file.'));
  }
}

function randomRateId(): string {
  // "BATCH-<digits>" mirrors the example payload's shape ("BATCH-001", 9 chars). RateId is a
  // fixed-length SAP field — a 6-digit suffix (12 chars total) blew past its max length and SAP
  // rejected the whole save with an EDM facet error, so this stays 3 digits to match the example.
  const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `BATCH-${suffix}`;
}

// SAP wants year/month as separate fields alongside the full date, all derived from the one
// "Valid From" date the user actually picks — no reason to ask for three separate inputs.
function splitDate(validFrom: string): { zyear: string; zmonth: string; zdate: string } {
  const [y, m] = validFrom.split('-');
  return { zyear: y, zmonth: m, zdate: `${validFrom}T00:00:00` };
}

function toSapLineItem(row: MarketRateRow, rateId: string) {
  const { zyear, zmonth, zdate } = splitDate(row.validFrom);
  return {
    RateId: rateId,
    CompanyCode: DEFAULT_COMPANY_CODE,
    Zyear: zyear,
    Zmonth: zmonth,
    Zdate: zdate,
    Matnr: row.materialCode,
    ZmarketName: row.marketName,
    Maktx: row.materialDesc,
    Mtart: row.materialType,
    Zrate: row.marketRate,
    ZratePer: row.ratePer,
    Igst: row.igst || '0.00',
    Sgst: row.sgst || '0.00',
    Cgst: row.cgst || '0.00',
    ActiveInd: 'X',
  };
}

/** opts.rateId: pass the row's existing rateId (Dashboard edit flow) to re-save under the same
 * header instead of minting a new batch; omitted (Home's create flow) generates a fresh one.
 * opts.email: the submitter to record on the header — NOT yet verified live as a real field on
 * ZMarketRateHeaderSet (see ROLE_ENTITY_SET's note above for the same caveat); it's what the
 * Dashboard's Email-based fetch filter depends on, so confirm it against SAP metadata before
 * relying on non-Admin users only seeing their own rows. */
export async function saveMarketRates(rows: MarketRateRow[], opts: { rateId?: string; email?: string } = {}): Promise<void> {
  const rateId = opts.rateId || randomRateId();
  const payload: Record<string, unknown> = {
    RateId: rateId,
    ToMarketRates: rows.map((row) => toSapLineItem(row, rateId)),
  };
  if (opts.email) payload.Email = opts.email;
  const result = await sapClient.post(`/${ENTITY_SET}`, payload);
  // SAP's OData gateway sometimes returns HTTP 200 with an error body instead of a non-2xx status.
  const body = result.data?.d || result.data;
  if (body?.Type === 'E') {
    throw new Error(body.Message || 'SAP rejected this batch.');
  }
}
