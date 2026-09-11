const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(value) {
  if (!value) return '-';
  if (typeof value === 'number') return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (typeof value === 'string' && value.startsWith('/Date(')) {
    const ms = Number(value.match(/-?\d+/)?.[0]);
    if (!Number.isNaN(ms)) return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatCurrency(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
}

export function statusText(status) {
  const map = {
    ACTIVE: 'Active',
    ONHOLD: 'On Hold',
    INACTIVE: 'Inactive',
    EXPIRED: 'Expired',
    BLACKLISTED: 'Blacklisted',
    PENDING_APPROVAL: 'Pending Approval',
  };
  return map[status] || status;
}

export function statusColor(status) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'ONHOLD':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'INACTIVE':
      return 'bg-slate-100 text-slate-600 border border-slate-200';
    case 'BLACKLISTED':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'EXPIRED':
      return 'bg-slate-100 text-slate-600 border border-slate-200';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

export function contractPeriod(start, end) {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

export function paymentStatusText(status) {
  const map = { PAID: 'Paid', UNPAID: 'Unpaid', PARTIAL: 'Partial', FLAGGED: 'Flagged' };
  return map[status] || status;
}

export function paymentStatusColor(status) {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'PARTIAL':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'FLAGGED':
      return 'bg-red-50 text-red-700 border border-red-200';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}
