// SAP OData integration for Market Rate. One POST per save, a "deep insert" into the header
// entity with every row nested under ToMarketRates — SAP creates the header row and all its line
// items in a single call, sharing one RateId (a randomly generated batch id, not user-entered).
import axios from 'axios';

const SAP_BASE_URL = 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZMM_MARKET_RATE_SRV';
const ENTITY_SET = 'ZMarketRateHeaderSet';

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
  validFrom: string; // yyyy-mm-dd, as typed
}

function randomRateId(): string {
  // "BATCH-<digits>" mirrors the example payload's shape; the digits just need to be unique
  // enough that two saves in quick succession don't collide.
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `BATCH-${suffix}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// SAP wants year/month as separate fields alongside the full date, all derived from the one
// "Valid From" date the user actually types — no reason to ask for three separate inputs.
function splitDate(validFrom: string): { zyear: string; zmonth: string; zdate: string } {
  const [y, m] = validFrom.split('-');
  return { zyear: y, zmonth: m, zdate: `${validFrom}T00:00:00` };
}

function toSapLineItem(row: MarketRateRow, rateId: string, companyCode: string) {
  const { zyear, zmonth, zdate } = splitDate(row.validFrom);
  return {
    RateId: rateId,
    CompanyCode: companyCode,
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

export async function saveMarketRates(rows: MarketRateRow[], companyCode: string): Promise<void> {
  const rateId = randomRateId();
  const payload = {
    RateId: rateId,
    ToMarketRates: rows.map((row) => toSapLineItem(row, rateId, companyCode)),
  };
  const result = await sapClient.post(`/${ENTITY_SET}`, payload);
  // SAP's OData gateway sometimes returns HTTP 200 with an error body instead of a non-2xx status.
  const body = result.data?.d || result.data;
  if (body?.Type === 'E') {
    throw new Error(body.Message || 'SAP rejected this batch.');
  }
}
