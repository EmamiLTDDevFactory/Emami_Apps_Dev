'use client';

import Link from 'next/link';
import { HeartPulse, ShieldCheck, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import OrgDetailsStrip from '../components/OrgDetailsStrip';

function PolicyTile({
  icon: Icon,
  title,
  submitted,
  summary,
  href,
}: {
  icon: typeof HeartPulse;
  title: string;
  submitted: boolean;
  summary: string | null;
  href: string;
}) {
  return (
    <div className="glass-card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-glassRust text-rust">
          <Icon size={16} />
        </div>
        <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
        <span
          className={`ml-auto pill ${submitted ? 'bg-greenBg text-green' : 'bg-amberBg text-amber'}`}
        >
          {submitted ? 'Submitted' : 'Not Submitted'}
        </span>
      </div>
      {summary && <p className="text-[12px] text-inkSoft">{summary}</p>}
      <Link href={href} className="btn-primary mt-1 self-start !px-3 !py-1.5 text-[12.5px]">
        {submitted ? 'View / Edit' : 'Fill Form'}
        <ArrowRight size={13} />
      </Link>
    </div>
  );
}

export default function HomePage() {
  const { employee, loading, error, myMediclaim, myTermPolicy } = useApp();

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-rust border-t-transparent" />
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="glass-card mx-auto max-w-sm p-4 text-center">
        <p className="text-[13px] font-semibold text-red">{error || 'Could not load your details.'}</p>
      </div>
    );
  }

  return (
    <div>
      <OrgDetailsStrip employee={employee} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PolicyTile
          icon={HeartPulse}
          title="Mediclaim Policy"
          submitted={Boolean(myMediclaim)}
          summary={myMediclaim ? `${myMediclaim.policyType} • Sum Insured ${myMediclaim.sumInsured}` : 'Cover yourself and your family under the group mediclaim policy.'}
          href="/mediclaim/"
        />
        <PolicyTile
          icon={ShieldCheck}
          title="Term Life Policy"
          submitted={Boolean(myTermPolicy)}
          summary={myTermPolicy ? `Sum Assured ${myTermPolicy.sumAssured}` : 'Secure your nominees with a group term life cover.'}
          href="/term-policy/"
        />
      </div>
    </div>
  );
}
