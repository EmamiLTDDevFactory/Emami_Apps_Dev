'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { access, list, ApiError } from './api';
import type { Config, CurrentUser, UserPlant } from './entities';

/** Who is signed in, as SAP sees them (role, plants, admin) + the live ConfigSet. Loaded once, shared by every screen. */
export interface Session {
  loading: boolean;
  error: string;
  userId: string; fullName: string; email: string; role: string; unit: string;
  isAdmin: boolean; isGlobal: boolean; active: boolean;
  /** Admin role of this app in Emami Apps (Admin Center): sees and uses the maintenance screens. Not the SAP IsAdmin flag. */
  hubAdmin: boolean;
  /** SAP plant codes this person may see (empty + isGlobal = every plant) */
  plants: { code: string; name: string }[];
  fiscalYear: string;
  /** ConfigSet rows by Param (SLA_WARN_DAYS, QUOTA_YEAR_CAP, ...) */
  config: Record<string, string>;
  /** a numeric ConfigSet value, or the fallback */
  cfgNum: (param: string, fallback: number) => number;
  /** can this person see the plant? (SAP enforces it too; this only hides what would come back empty) */
  canSeePlant: (werks: string) => boolean;
  reload: () => void;
}

const empty: Session = {
  loading: true, error: '', userId: '', fullName: '', email: '', role: '', unit: '', isAdmin: false, isGlobal: false, active: false, hubAdmin: false,
  plants: [], fiscalYear: '', config: {}, cfgNum: (_p, f) => f, canSeePlant: () => false, reload: () => undefined,
};
const Ctx = createContext<Session>(empty);
export const useSession = () => useContext(Ctx);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Session, 'cfgNum' | 'canSeePlant' | 'reload'>>({ ...empty });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const hubAdmin = await access().then((a) => a.isAdmin).catch(() => false);
        const [u, p, c] = await Promise.allSettled([
          list<CurrentUser>('CurrentUserSet'),
          list<UserPlant>('UserPlantSet'),
          list<Config>('ConfigSet'),
        ]);
        // A hub administrator may not be a CAPEX user yet (that is what Maintenance is for), so SAP errors do not block them.
        const bad = [u, p, c].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (bad && !hubAdmin) throw bad.reason;
        const ok = <T,>(r: PromiseSettledResult<{ rows: T[] }>) => (r.status === 'fulfilled' ? r.value : { rows: [] as T[] });
        if (!live) return;
        const me = ok(u).rows[0];
        const config: Record<string, string> = {};
        ok(c).rows.forEach((r) => { config[r.Param] = r.Value; });
        setState({
          loading: false, error: '',
          userId: me?.Userid ?? '', fullName: me?.Fullname ?? '', email: me?.Email ?? '', role: me?.Role ?? '', unit: me?.Unit ?? '',
          isAdmin: me?.IsAdmin === 'X', isGlobal: me?.IsGlobal === 'X', active: me?.Active === 'X', hubAdmin,
          plants: ok(p).rows.map((r) => ({ code: r.Werks, name: r.PlantName })), fiscalYear: me?.Fiscalyear ?? '', config,
        });
      } catch (e) {
        if (live) setState({ ...empty, loading: false, error: e instanceof ApiError ? e.message : 'Could not load your CAPEX profile.' });
      }
    })();
    return () => { live = false; };
  }, [tick]);

  const value = useMemo<Session>(() => ({
    ...state,
    reload,
    cfgNum: (param, fallback) => { const n = Number(state.config[param]); return Number.isFinite(n) && state.config[param] !== undefined && state.config[param] !== '' ? n : fallback; },
    canSeePlant: (werks) => state.isGlobal || state.isAdmin || state.plants.some((x) => x.code === werks),
  }), [state, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
