/**
 * Where a notification leads. SAP stores the Fiori route name (budgetDetail, approvalDetail, cpeDetail, icDetail, evaluation ...)
 * plus the id in ParamName/ParamValue; this maps them onto this app's screens. Falls back to the document type + id, then to the dashboard.
 */
export interface NotifyTarget { Route?: string; ParamName?: string; ParamValue?: string; Doctype?: string; Docid?: string }

const enc = encodeURIComponent;

export function notificationPath(n: NotifyTarget): string {
  const id = (n.ParamValue || n.Docid || '').trim();
  const route = (n.Route || '').trim();
  // A route that is already a path of this app (older rows / future senders)
  if (route.startsWith('/')) return route;
  if (id) {
    switch (route.toLowerCase()) {
      case 'budgetdetail': case 'budgetapprovaldetail': return `/budget/detail/?id=${enc(id)}`;
      case 'approvaldetail': return `/approvals/detail/?type=CPE&id=${enc(id)}`;
      case 'cpedetail': return `/cpe/detail/?id=${enc(id)}`;
      case 'evaluation': return `/evaluation/?id=${enc(id)}`;
      case 'icdetail': return `/ic/detail/?id=${enc(id)}`;
      case 'podetail': return `/po/detail/?id=${enc(id)}`;
      case 'quotaitemdetail': return `/quota/detail/?id=${enc(id)}`;
      case 'cwipcreate': return `/cwip/create/?cpe=${enc(id)}`;
    }
    switch ((n.Doctype || '').toUpperCase()) {
      case 'BUD': return `/budget/detail/?id=${enc(id)}`;
      case 'CPE': return `/cpe/detail/?id=${enc(id)}`;
      case 'IC': return `/ic/detail/?id=${enc(id)}`;
      case 'PO': return `/po/detail/?id=${enc(id)}`;
    }
  }
  return '/';
}
