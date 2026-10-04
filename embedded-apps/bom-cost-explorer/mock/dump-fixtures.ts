/** Writes sample raw OData V2 responses (exactly what the mock / SAP sends) to mock/fixtures/.
 *   npx tsx mock/dump-fixtures.ts */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mockSapFetch } from './sap';
import { ENTITY_SET as S } from '../src/lib/sap/entities';

process.env.MOCK_SAP_DELAY_MS = '0';
const base = 'http://x/sap/opu/odata/sap/ZMM_BOM_COST_SRV';
const dir = join(__dirname, 'fixtures');
const q = (s: string) => encodeURIComponent(s);
const cases: [string, string][] = [
  [`${S.COST_LINES}-B`, `${S.COST_LINES}?$expand=RateOptions&$filter=${q("Mode eq 'B' and (Matnr eq 'FG1001' or Matnr eq 'FG3001' or Matnr eq 'NOPE') and (Werks eq '1000' or Werks eq '1300') and ExplQty eq 1000m and Lookback eq 365 and Prio eq 'CONTRACT,INFOREC,MARKT,CONSUMP,MBEW' and DonorPlant eq '1000' and InclFrt eq true and StdFrt eq false and InclBudget eq true and BudgetYr eq '2026' and InclCover eq true and Hor1 eq 30 and Hor2 eq 60 and Hor3 eq 90")}`],
  [`${S.COST_LINES}-C`, `${S.COST_LINES}?$filter=${q("Mode eq 'C' and Matnr eq 'FG2001' and Werks eq '1000' and (Cplnt eq '1000' or Cplnt eq '1100' or Cplnt eq 'BD10') and ExplQty eq 1000m and Lookback eq 365 and InclFrt eq true")}`],
  [`${S.RATES}-R`, `${S.RATES}?$top=20&$skip=0&$inlinecount=allpages&$filter=${q("Mode eq 'R' and Matnr eq 'FG1001' and Werks eq '1000' and Lookback eq 365")}`],
  [`${S.FREIGHT}-F`, `${S.FREIGHT}?$top=20&$skip=0&$inlinecount=allpages&$filter=${q("Mode eq 'F' and Matnr eq 'FG1001' and (Werks eq '1000' or Werks eq 'BD10') and FreightDays eq 365 and StdFrt eq '' and LatestOnly eq ''")}`],
  [`${S.RMPM}-M`, `${S.RMPM}?$top=20&$skip=0&$inlinecount=allpages&$filter=${q("Mode eq 'M' and Matnr eq 'FG1001' and Werks eq '1000' and ExplQty eq 1000m and Lookback eq 365")}`],
  [S.PLANTS, S.PLANTS],
  [`${S.MATERIALS}-search-oil`, `${S.MATERIALS}?search=oil&$top=100`],
  [S.CONFIG, S.CONFIG],
  [`${S.COST_LINES}-error-400`, `${S.COST_LINES}?$filter=${q("Mode eq 'B' and Matnr eq 'FAIL01' and Werks eq '1000'")}`],
];
(async () => {
  for (const [name, path] of cases) {
    const r = await mockSapFetch(`${base}/${path}&$format=json`.replace(/^([^?]*)&/, '$1?'));
    const body = await r.json();
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ status: r.status, sapMessage: r.headers.get('sap-message'), body }, null, 1));
    console.log(name, r.status);
  }
  const md = await mockSapFetch(`${base}/$metadata`);
  writeFileSync(join(dir, 'metadata.xml'), await md.text());
})();
