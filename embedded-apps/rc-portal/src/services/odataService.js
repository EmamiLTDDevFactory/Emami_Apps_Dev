import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (window.location.port === '3000' ? 'http://localhost:5000/api' : '/api');

// Direct SAP OData gateway base — only for consultantSet, which Basis has explicitly opened for
// anonymous GET access (mirroring the exception already granted for MoldHealthCheck's
// ZMM_MOULD_CARE_SRV). Hardcoded (not env-based) on purpose, same convention as
// MoldHealthCheck's lib/config.ts — deploys with zero extra configuration, no Amplify Console
// env var needed.
const SAP_BASE_URL = "https://emamiapi.emamigroup.com/api/NGD/ZRCPORTAL_SRV";

const PARAMS_SERIALIZER = {
  // Lambda Function URLs reject raw '+' characters in query strings
  // (InvalidQueryStringException). Axios's default serializer encodes
  // spaces as '+'; force %20 encoding instead via encodeURIComponent.
  serialize: (params) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&'),
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  paramsSerializer: PARAMS_SERIALIZER,
});

// Direct SAP OData calls — only for entity sets Basis has explicitly opened for anonymous GET
// access (currently consultantSet, mirroring the exception already granted for
// MoldHealthCheck's ZMM_MOULD_CARE_SRV). Everything else (roles, closures, agreements,
// employees, invoices, fees, login) still goes through the backend — either because it's a
// write, or because its data (payment amounts, PII) hasn't been confirmed safe for anonymous
// access yet.
const sapClient = axios.create({
  baseURL: SAP_BASE_URL,
  headers: { Accept: 'application/json' },
  paramsSerializer: PARAMS_SERIALIZER,
});

export async function getConsultants(filter, orderby) {
  // Read login module flags and role from localStorage
  const ta = localStorage.getItem('employeeTa');
  const tm = localStorage.getItem('employeeTm');
  const ld = localStorage.getItem('employeeLd');
  const od = localStorage.getItem('employeeOd');
  const role = localStorage.getItem('employeeRole');

  const activeFilters = [];
  if (filter) activeFilters.push(filter);
  if (role) activeFilters.push(`Role eq '${role}'`);
  if (ta === 'X') activeFilters.push("Ta eq 'X'");
  if (tm === 'X') activeFilters.push("Tm eq 'X'");
  if (ld === 'X') activeFilters.push("Ld eq 'X'");
  if (od === 'X') activeFilters.push("Od eq 'X'");

  const params = { $format: 'json' };
  if (activeFilters.length > 0) params.$filter = activeFilters.join(' and ');
  if (orderby) params.$orderby = orderby;

  const response = await sapClient.get('/consultantSet', { params });
  return response.data?.d?.results || response.data?.results || [];
}

export async function getConsultant(id) {
  const response = await sapClient.get('/consultantSet', {
    params: { $filter: `ConsultantId eq '${id}'`, $format: 'json' },
  });
  const results = response.data?.d?.results || response.data?.results || [];
  return results[0] || {};
}

export async function createConsultant(payload) {
  const response = await apiClient.post('/consultants', payload);
  return response.data;
}

export async function getRoles() {
  const response = await apiClient.get('/roles');
  return response.data || [];
}

export async function createRole(payload) {
  const response = await apiClient.post('/roles', payload);
  return response.data;
}

export async function deleteRole(payload) {
  const response = await apiClient.post('/roles', payload);
  return response.data;
}

export async function updateConsultant(id, payload) {
  const response = await apiClient.put(`/consultants/${id}`, payload);
  return response.data;
}

export async function updateConsultantStatus(id, status) {
  const filter = `ConsultantId eq '${id}' and Status eq '${status}'`;
  const response = await apiClient.get('/consultants', { params: { $filter: filter } });
  return response.data;
}

export async function getConsultantDetail(id) {
  const response = await apiClient.get(`/consultants/${id}/detail`);
  return response.data || {};
}

export async function createClosure(payload) {
  const response = await apiClient.post('/closures', payload);
  return response.data;
}

export async function getClosure(consultantId, closureId) {
  // CLOSURESet is open for direct anonymous GET (confirmed with Basis). SAP Gateway fails on
  // exact key predicates and returns empty for multiple filters, so — same as the backend used
  // to do — fetch all closures for the consultant and find the matching one in memory.
  const response = await sapClient.get('/CLOSURESet', {
    params: { $filter: `ConsultantId eq '${consultantId}'`, $format: 'json' },
  });
  const results = response.data?.d?.results || response.data?.results || [];
  const closure = results.find((c) => c.ClosureId === closureId);
  if (!closure) {
    throw new Error('Closure not found in SAP');
  }
  return closure;
}

export async function updateClosure(consultantId, closureId, payload) {
  const response = await apiClient.put(`/closures/${consultantId}/${closureId}`, payload);
  return response.data;
}

export async function getAgreementPdf(id) {
  const response = await apiClient.get(`/agreements/${id}`);
  return response.data || {};
}

export async function getEmployees() {
  // EmpSet is open for direct anonymous GET (confirmed with Basis).
  const response = await sapClient.get('/EmpSet', { params: { $format: 'json' } });
  return response.data?.d?.results || response.data?.results || [];
}

export async function getInvoicePdf(id, invNo) {
  const response = await apiClient.get(`/invoices/${id}/${invNo}`);
  return response.data || {};
}

// Login stays on the backend (unlike consultants/employees/fees/closures, which now call SAP
// directly) — direct-to-SAP login showed intermittent failures under real testing on the
// non-ctc-expense equivalent, so this reverts to the backend-mediated flow that's been reliable
// for months, rather than ship something flaky to a live app.
export async function verifyUser(loginId) {
  const response = await apiClient.get(`/user/${loginId}`);
  return response.data;
}

export async function loginUser(loginId, otp) {
  const response = await apiClient.post('/login', { loginId, otp });
  return response.data;
}

export async function createFeeSlab(payload) {
  const response = await apiClient.post('/fees', payload);
  return response.data;
}

export async function getFeeSlabs(consultantId) {
  // FeesSet is open for direct anonymous GET (confirmed with Basis).
  const filter = `ConsultantId eq '${consultantId}'`;
  const response = await sapClient.get('/FeesSet', { params: { $filter: filter, $format: 'json' } });
  return response.data?.d?.results || response.data?.results || [];
}

export async function updateFeeSlabs(consultantId, slabs) {
  const response = await apiClient.put(`/fees/${consultantId}`, { consultantId, slabs });
  return response.data;
}


