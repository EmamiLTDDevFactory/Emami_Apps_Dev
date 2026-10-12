'use client';
/** /plan/upload - upload wizard. Phase 2 scaffold: template, parsing, client checks, "Check with SAP"
 * (Dryrun) and "Save" arrive in phase 3. */
import PlanFrame from './PlanFrame';
import { Card, Empty } from '../ui';

export default function UploadPage() {
  return (
    <PlanFrame active="upload">
      <Card title="Upload plan">
        <Empty title="Upload wizard" icon="⇪">
          Excel template (Material, Plant, Plan, Country, Apr..Mar), checks in the browser, then <strong>Check with SAP</strong> (dry run) and
          <strong> Save</strong>, merge or replace. Comes in the next phase.
        </Empty>
      </Card>
    </PlanFrame>
  );
}
