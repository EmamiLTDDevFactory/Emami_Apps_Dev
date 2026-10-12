'use client';
/** /plan - list of plans in SAP (PlanHeadSet). Phase 2 scaffold: the list, search, template download and
 * upload button arrive in phase 3. */
import Link from 'next/link';
import { Upload } from 'lucide-react';
import PlanFrame from './PlanFrame';
import { Card, Empty } from '../ui';

export default function PlansPage() {
  return (
    <PlanFrame active="plans">
      <Card title="Production plans" actions={<Link href="/plan/upload/" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-accent to-accent-deep px-3 py-1.5 text-xs font-bold text-white"><Upload size={14} /> Upload plan</Link>}>
        <Empty title="Plans list" icon="▦">
          The plans in SAP (PlanHeadSet: name, rows, plants, total) with search, open and template download come in the next phase.
          Open a plan directly with <span className="font-mono">/plan/view/?plan=&lt;name&gt;</span>.
        </Empty>
      </Card>
    </PlanFrame>
  );
}
