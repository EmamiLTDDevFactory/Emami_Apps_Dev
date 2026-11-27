/*
   ITIL 4 practices that Samadhan implements, in plain words. Used by the ITSM tags on screens and cards and by the
   ITSM overview screen, so anybody can see which ITSM practice a part of the app belongs to.
*/
export type Practice =
  | 'servicedesk' | 'incident' | 'major' | 'request' | 'problem' | 'change' | 'config' | 'asset' | 'knowledge'
  | 'slm' | 'supplier' | 'escalation' | 'workflow' | 'event' | 'reporting' | 'availability' | 'release';

export const PRACTICES: Record<Practice, { label: string; short: string; plain: string }> = {
  servicedesk: { label: 'Service Desk', short: 'Service desk', plain: 'The single point of contact: tickets by email, phone, portal, WhatsApp and chat, worked by L1 / L2 / L3 teams.' },
  incident: { label: 'Incident Management', short: 'Incident', plain: 'Something that worked has stopped or degraded. Log, categorise, prioritise (impact × urgency), diagnose, resolve and close - fast, within the SLA.' },
  major: { label: 'Major Incident', short: 'Major incident', plain: 'Urgent, wide business impact (e.g. SAP down for a plant): bridge call, regular updates, post-incident review.' },
  request: { label: 'Service Request Management', short: 'Service request', plain: 'Something new is asked for (laptop, access, VPN ...): picked from the service catalogue, approved when needed, then fulfilled.' },
  problem: { label: 'Problem Management', short: 'Problem', plain: 'The cause behind repeated incidents: root-cause analysis, workaround, permanent fix, known-error database (KEDB).' },
  change: { label: 'Change Enablement', short: 'Change', plain: 'Any change to production is planned, risk-assessed, approved (CAB), scheduled outside freezes, implemented and reviewed.' },
  release: { label: 'Release Management', short: 'Release', plain: 'SAP transports and deployments moved through DEV → QAS → PRD with tests and sign-off.' },
  config: { label: 'Service Configuration Management (CMDB)', short: 'Configuration', plain: 'Configuration items (laptops, servers, applications ...) identified, controlled, status-accounted, verified, with their relationships.' },
  asset: { label: 'IT Asset Management', short: 'IT asset', plain: 'Every asset tagged and registered; allocated to a user; lifecycle from stock to disposal; warranty tracked.' },
  knowledge: { label: 'Knowledge Management', short: 'Knowledge', plain: 'What was learnt is written down: solution articles and known errors, so the next person solves it in minutes.' },
  slm: { label: 'Service Level Management', short: 'SLA', plain: 'Response and resolution targets per priority and desk, business hours, reminders and breaches, reported every month.' },
  supplier: { label: 'Supplier Management', short: 'Supplier', plain: 'The ITSM support vendor (Allied Digital today) and the hyperscaler: contract, SLA target, scorecard, report card.' },
  escalation: { label: 'Escalation', short: 'Escalation', plain: 'Functional (to L2 / L3 teams) and hierarchical (vendor lead → delivery manager → client IT manager → head of IT).' },
  workflow: { label: 'Workflow & Automation', short: 'Workflow', plain: 'Routing rules, approval chains, time-based automations and scenarios move tickets without manual effort.' },
  event: { label: 'Monitoring & Event Management', short: 'Monitoring', plain: 'Alerts from monitoring tools and SAP Cloud ALM become tickets automatically, without duplicates.' },
  reporting: { label: 'Measurement & Reporting', short: 'Reporting', plain: 'Dashboards, KPIs (SLA %, first contact resolution, MTTR, CSAT), registers and Excel reports.' },
  availability: { label: 'Availability / Service Health', short: 'Service health', plain: 'At-a-glance health: major incidents, open problems, changes coming, pending approvals.' },
};
