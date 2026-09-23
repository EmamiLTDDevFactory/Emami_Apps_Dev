import { CheckCircle2, Clock, XCircle } from 'lucide-react';

const VARIANTS = {
  pending: { classes: 'bg-amberBg text-amber', icon: Clock, label: 'Pending' },
  approved: { classes: 'bg-greenBg text-green', icon: CheckCircle2, label: 'Approved' },
  rejected: { classes: 'bg-redBg text-red', icon: XCircle, label: 'Rejected' },
} as const;

export default function StatusBadge({ variant, label }: { variant: keyof typeof VARIANTS; label?: string }) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <span className={`pill ${v.classes}`}>
      <Icon size={12} />
      {label || v.label}
    </span>
  );
}

export function ReleaseBadge({ released }: { released: boolean }) {
  return (
    <span className={`text-[11px] font-semibold ${released ? 'text-green' : 'text-red'}`}>
      {released ? 'Released' : 'Unreleased'}
    </span>
  );
}
