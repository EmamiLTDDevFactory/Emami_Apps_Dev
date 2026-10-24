'use client';
/**
 * Production plan > Cost breakup: the plan's SAP costing (the same Mode P run as Breakup & cost) broken into cost
 * elements per finished good - material from the costing lines, conversion from process orders - for the whole plan
 * and per FG, at the plan quantity (components/costbreakup/CostBreakup).
 */
import { useCallback } from 'react';
import CostBreakup from '../costbreakup/CostBreakup';
import { CostError, PlanQueryBar } from './common';
import { Card, Empty, Skeleton } from '../ui';
import { D } from '@/lib/cost/decimal';
import type { PlanCostLine } from '@/lib/plan/fields';
import type { PlanWorkspace } from '@/lib/plan/workspace';

export default function CostBreakupTab({ ws }: { ws: PlanWorkspace }) {
  const { cost } = ws;
  const qtyOf = useCallback((l: PlanCostLine) => D(l.QtyTot), []);
  const fgQtyOf = useCallback((l: PlanCostLine) => D(l.PlanQty), []);
  const running = cost.status === 'running';
  return (
    <div className="flex flex-col gap-3">
      <PlanQueryBar query={ws.query} onChange={ws.setQuery} onRun={(q) => void ws.runCost(q)} onCancel={ws.cancelCost} running={running} ms={cost.ms} />
      {cost.status === 'error' && <CostError error={cost.error} />}
      {running && !cost.rows.length ? (
        <Card><Skeleton rows={10} /></Card>
      ) : !cost.rows.length ? (
        <Card><Empty title="Nothing costed yet" icon="▦">Press <b>Run in SAP</b> (or run it on Breakup &amp; cost - both tabs use the same run). The cost breakup splits each plan material into Raw Material, Perfume, Pack Material, Labour, Power, Machine, Steam and Conversion Charge at the plan quantity.</Empty></Card>
      ) : (
        <Card bodyClass="p-0">
          <CostBreakup lines={cost.rows as PlanCostLine[]} qtyOf={qtyOf} fgQtyOf={fgQtyOf} qtyLabel="the plan quantity" exportName="Plan cost breakup" />
        </Card>
      )}
    </div>
  );
}
