/**
 * Maintenance of the SAP master tables from the app (premium rates, top-up premiums, policy periods, authorised users).
 * Two generic entities of ZMEDICLAIM_SRV serve every table (class ZCL_INS_MAINT, see ../../sap/zcl_ins_maint.abap):
 *   GET  MaintRowSet?$filter=Email eq '..' and Table eq '..' [and Year eq '..']   rows of one table
 *   POST MaintCmdSet {Email, Table, Year, ToYear, Action, Rows:[..]}              Action = SAVE | REPLACE | DELETE | COPY
 * Table codes: BASE = ZBASE_PREMIUM, TOPUP = ZTOP_PREMIUM, MPERIOD = ZMEDI_PERIOD, AUTH = ZMEDI_AUTH_USERS. HR admins only (SAP checks again).
 */
import { eq, str } from './format';
import { sapCreate, sapList } from './sap';
import { getHubEmail } from './hubEmailLogin';

const email = () => (getHubEmail() ?? '').trim().toLowerCase();

export interface MaintRow {
  key1: string; key2: string; key3: string; year: string;
  val1: string; val2: string; val3: string; val4: string; val5: string;
}
export type MaintAction = 'SAVE' | 'REPLACE' | 'DELETE' | 'COPY';
export interface MaintApi {
  list(table: string, year?: string): Promise<MaintRow[]>;
  apply(table: string, action: MaintAction, rows: MaintRow[], o?: { year?: string; toYear?: string }): Promise<number>;
}

export const blankRow = (): MaintRow => ({ key1: '', key2: '', key3: '', year: '', val1: '', val2: '', val3: '', val4: '', val5: '' });
const map = (r: any): MaintRow => ({
  key1: str(r.Key1), key2: str(r.Key2), key3: str(r.Key3), year: str(r.Year),
  val1: str(r.Val1), val2: str(r.Val2), val3: str(r.Val3), val4: str(r.Val4), val5: str(r.Val5),
});

export const maintApi: MaintApi = {
  async list(table, year) {
    const rows = await sapList('MaintRowSet', { filter: [eq('Email', email()), eq('Table', table), year ? eq('Year', year) : undefined] });
    return rows.map(map);
  },
  async apply(table, action, rows, o = {}) {
    const me = email();
    const r = await sapCreate('MaintCmdSet', {
      Email: me, Table: table, Year: o.year ?? '', ToYear: o.toYear ?? '', Action: action,
      Rows: rows.map((x) => ({ Email: me, Table: table, Key1: x.key1, Key2: x.key2, Key3: x.key3, Year: x.year || o.year || '', Val1: x.val1, Val2: x.val2, Val3: x.val3, Val4: x.val4, Val5: x.val5 })),
    });
    return Number(r?.Count) || rows.length;
  },
};
