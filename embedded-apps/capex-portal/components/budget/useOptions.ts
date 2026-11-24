'use client';
import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { useList } from '@/lib/useData';
import type { ValueHelp } from '@/lib/entities';
import type { Option } from './logic';

const byOrder = (a: ValueHelp, b: ValueHelp) => Number(a.Sortorder) - Number(b.Sortorder) || a.Textval.localeCompare(b.Textval);

/**
 * Dropdown lists for the Budget screens. Capex Type / Category come live from ValueHelpSet (domains CAPEXTYPE, CATEGORY - the DPC
 * reads zcapex_vh). Plants come from the session's UserPlantSet; a person with no plant rows (global) falls back to ValueHelpSet
 * Domain PLANT, which SAP already cuts to what they may see.
 */
export function useBudgetOptions() {
  const { plants: userPlants, loading: sessionLoading } = useSession();
  const needPlantVh = !sessionLoading && userPlants.length === 0;
  const types = useList<ValueHelp>('ValueHelpSet', { $filter: "Domain eq 'CAPEXTYPE'" });
  const cats = useList<ValueHelp>('ValueHelpSet', { $filter: "Domain eq 'CATEGORY'" });
  const plantVh = useList<ValueHelp>(needPlantVh ? 'ValueHelpSet' : null, { $filter: "Domain eq 'PLANT'" });

  const plants = useMemo<Option[]>(() => userPlants.length
    ? userPlants.map((p) => ({ key: p.code, text: p.name }))
    : plantVh.rows.map((r) => ({ key: r.Keyval, text: r.Textval })), [userPlants, plantVh.rows]);
  const capexTypes = useMemo<Option[]>(() => types.rows.slice().sort(byOrder).map((r) => ({ key: r.Keyval, text: r.Textval })), [types.rows]);
  const categories = useMemo<Option[]>(() => cats.rows.slice().sort(byOrder).map((r) => ({ key: r.Keyval, text: r.Textval })), [cats.rows]);
  const loading = sessionLoading || types.loading || cats.loading || plantVh.loading;
  const error = types.error || cats.error || plantVh.error;
  return { plants, capexTypes, categories, loading, error };
}
