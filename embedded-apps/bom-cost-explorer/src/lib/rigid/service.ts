import { odataString } from '../sap/filter';
import { readSet, type Read } from '../price-context/odata';
import { RIGID_FIELDS, RIGID_SET, type RigidMode, type RigidRow } from './fields';

const NONE: ReadonlySet<string> = new Set();
const strip = (m: string) => m.trim().toUpperCase().replace(/^0+/, '');

export interface RigidQuery { matnr: string[]; werks?: string; gjahr?: string; mode?: RigidMode }

/** $filter of a RigidSet read. A plant is 4 characters; the year 4 digits. Material numbers go without leading zeros (SAP pads them). */
export function buildRigidFilter(q: RigidQuery): string {
  const m = [...new Set(q.matnr.map(strip).filter(Boolean))];
  if (!m.length) throw new Error('A material number is needed.');
  if (m.some((x) => !/^[A-Z0-9]{1,18}$/.test(x))) throw new Error('A material number is up to 18 characters.');
  const w = (q.werks ?? '').trim().toUpperCase();
  if (w && !/^[A-Z0-9]{4}$/.test(w)) throw new Error('A plant is 4 characters.');
  if (q.gjahr && !/^\d{4}$/.test(q.gjahr)) throw new Error('The year is 4 digits.');
  const parts = [m.length === 1 ? `Matnr eq ${odataString(m[0])}` : `(${m.map((x) => `Matnr eq ${odataString(x)}`).join(' or ')})`];
  if (w) parts.push(`Werks eq ${odataString(w)}`);
  if (q.gjahr) parts.push(`Gjahr eq ${odataString(q.gjahr)}`);
  if (q.mode && q.mode !== 'C') parts.push(`Mode eq ${odataString(q.mode)}`);
  return parts.join(' and ');
}

/** A gateway that has the new service code but not (yet) the entity type answers 500 "Data object 'Rigid' not found": the same as "not published yet". */
const NOT_READY = /Data object 'Rigid' not found/i;
export async function fetchRigid(q: RigidQuery, signal?: AbortSignal): Promise<Read<RigidRow>> {
  try { return await readSet<RigidRow>(RIGID_SET, RIGID_FIELDS, NONE, buildRigidFilter(q), signal); }
  catch (e) { throw e instanceof Error && NOT_READY.test(`${e.message} ${(e as { details?: { message?: string }[] }).details?.map((d) => d.message).join(' ') ?? ''}`) ? new Error('ZRIGID is not available in this SAP system yet (the RigidSet service objects are not active on the gateway).') : e; }
}

/** Which of the materials are rigid packing items (have a current mould relation). Cached per material for the session; never throws (no icon on any error). */
const flagCache = new Map<string, Promise<number>>();
export function rigidMoulds(matnr: string): Promise<number> {
  const k = strip(matnr);
  let p = flagCache.get(k);
  if (!p) {
    p = fetchRigid({ matnr: [k], mode: 'F' }).then((r) => r.rows.find((x) => x.Grain === 'F')?.Nmould ?? 0).catch(() => { flagCache.delete(k); return 0; });
    flagCache.set(k, p);
  }
  return p;
}
export const clearRigidFlagCache = () => flagCache.clear();
