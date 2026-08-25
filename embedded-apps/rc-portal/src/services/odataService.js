import axios from 'axios';

// Direct SAP OData gateway base — Basis has confirmed anonymous access across ZRCPORTAL_SRV
// (reads AND writes), same as the exception already granted for MoldHealthCheck's
// ZMM_MOULD_CARE_SRV. This app no longer depends on any backend server (Lambda or otherwise) —
// every call below goes straight to SAP. Hardcoded (not env-based) on purpose, same convention as
// MoldHealthCheck's lib/config.ts — deploys with zero extra configuration, no Amplify Console env
// var needed.
const SAP_BASE_URL = "https://emamiapi.emamigroup.com/api/NGD/ZRCPORTAL_SRV";

const PARAMS_SERIALIZER = {
  // Force %20 encoding instead of axios's default '+' for spaces — SAP's OData
  // gateway expects standard percent-encoding in $filter/$expand query strings.
  serialize: (params) =>
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&'),
};

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
  const response = await sapClient.post('/consultantSet', payload);
  return response.data?.d || response.data;
}

export async function getRoles() {
  const response = await sapClient.get('/UserSet', { params: { $format: 'json' } });
  return response.data?.d?.results || response.data?.results || [];
}

export async function createRole(payload) {
  const response = await sapClient.post('/UserSet', payload);
  return response.data?.d || response.data;
}

export async function deleteRole(payload) {
  const response = await sapClient.post('/UserSet', payload);
  return response.data?.d || response.data;
}

export async function updateConsultant(id, payload) {
  const response = await sapClient.put(`/consultantSet('${id}')`, payload);
  return response.data?.d || response.data;
}

export async function updateConsultantStatus(id, status) {
  // Mirrors the backend's own (verification-only, not a real update) query exactly.
  const filter = `ConsultantId eq '${id}' and Status eq '${status}'`;
  const response = await sapClient.get('/consultantSet', { params: { $filter: filter, $format: 'json' } });
  return response.data?.d || response.data;
}

export async function getConsultantDetail(id) {
  const response = await sapClient.get(`/ConsIdSet('${id}')`, {
    params: { $format: 'json', $expand: 'Nav_ConsIdToClos,NAV_ConsIdToInv' },
  });
  return response.data?.d || response.data || {};
}

export async function createClosure(payload) {
  const response = await sapClient.post('/CLOSURESet', payload);
  return response.data?.d || response.data;
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
  // Not a real PUT — the backend re-submits via POST /CLOSURESet with the keys folded into the
  // payload instead of the URL, because SAP Gateway rejects PUTs with key predicates here. Same
  // shape, ported as-is.
  const response = await sapClient.post('/CLOSURESet', {
    ...payload,
    ConsultantId: consultantId,
    ClosureId: closureId,
  });
  return response.data?.d || response.data;
}

export async function getAgreementPdf(id) {
  const response = await sapClient.get(`/AgreementPdfSet(ConsultantId='${id}')`, {
    params: { $format: 'json' },
  });
  return response.data?.d || response.data || {};
}

export async function getEmployees() {
  // EmpSet is open for direct anonymous GET (confirmed with Basis).
  const response = await sapClient.get('/EmpSet', { params: { $format: 'json' } });
  return response.data?.d?.results || response.data?.results || [];
}

export async function getInvoicePdf(id, invNo) {
  const response = await sapClient.get(`/InvoicePdfSet(ConsultantId='${id}',InvNumber='${invNo}')`, {
    params: { $format: 'json' },
  });
  return response.data?.d || response.data || {};
}

// Login/OTP calls SAP's LoginSet directly too — Basis has explicitly approved anonymous
// access to LoginSet (both the GET lookup and the POST verify) for this app, same as the
// read-only entity sets above. Mirrors backend/server.js's /api/user/:id and /api/login exactly,
// minus the ALLOW_DUMMY_OTP bypass, which was backend-only and must never ship to the client.
export async function verifyUser(loginId) {
  const cleanId = String(loginId).trim();

  try {
    const response = await sapClient.get(`/LoginSet('${cleanId}')`, { params: { $format: 'json' } });
    const data = response.data?.d || response.data || {};
    if (data.Type === 'E' || (data.Message && /invalid|error|failed/i.test(data.Message))) {
      const err = new Error(data.Message || 'Invalid Employee ID');
      err.response = { status: 400, data: { success: false, error: data.Message || 'Invalid Employee ID' } };
      throw err;
    }
    return {
      success: true,
      login_id: data.LoginId || data.login_id || cleanId,
      email: data.Email || data.email || '',
    };
  } catch (e) {
    if (e?.response?.data?.error) throw e;

    // Fallback: try UserSet(ID), same as the backend used to do
    try {
      const response = await sapClient.get(`/UserSet('${cleanId}')`, { params: { $format: 'json' } });
      const data = response.data?.d || response.data || {};
      return {
        success: true,
        login_id: data.LoginId || data.emp_id || cleanId,
        email: data.Email || '',
      };
    } catch (e2) {
      const err = new Error('Invalid Employee ID');
      err.response = { status: 404, data: { success: false, error: 'Invalid Employee ID' } };
      throw err;
    }
  }
}

export async function loginUser(loginId, otp) {
  const cleanId = String(loginId).trim();
  const cleanOtp = String(otp || '').trim();

  const response = await sapClient.post('/LoginSet', { LoginId: cleanId, Otp: cleanOtp }, {
    headers: { 'Content-Type': 'application/json', 'DataServiceVersion': '2.0' },
  });
  const result = response.data?.d || response.data || {};

  if (result.Type === 'E' || (result.Message && /invalid|error|failed/i.test(result.Message))) {
    const err = new Error(result.Message || 'Invalid OTP code');
    err.response = { status: 400, data: { success: false, error: result.Message || 'Invalid OTP code' } };
    throw err;
  }

  return {
    success: true,
    login_id: result.LoginId || result.login_id || cleanId,
    name: result.Name || result.Ename || `Employee ${cleanId}`,
    role: result.Role || 'USER',
    email: result.Email || '',
    ta: result.Ta || '',
    tm: result.Tm || '',
    ld: result.Ld || '',
    od: result.Od || '',
    ...result,
  };
}

export async function createFeeSlab(payload) {
  const response = await sapClient.post('/FeesSet', payload);
  return response.data?.d || response.data;
}

export async function getFeeSlabs(consultantId) {
  // FeesSet is open for direct anonymous GET (confirmed with Basis).
  const filter = `ConsultantId eq '${consultantId}'`;
  const response = await sapClient.get('/FeesSet', { params: { $filter: filter, $format: 'json' } });
  return response.data?.d?.results || response.data?.results || [];
}

export async function updateFeeSlabs(consultantId, slabs) {
  // Ported from the backend's FEESSET_UPDATE_ENTITY route as-is, including its 3-tier fallback:
  // SAP Gateway accepts different key predicate shapes depending on the slab, so each PUT tries
  // FeesSet('feeId') first, then FeesSet(ConsultantId=..,FeeId=..), then legacy FeeSet('feeId').
  const cleanConsultantId = String(consultantId || '').padStart(10, '0');
  const slabList = Array.isArray(slabs) ? slabs : [];
  const updateResults = [];

  for (const slab of slabList) {
    const rawFeeId = String(slab.FeeId || slab.feeId || '').trim();
    const cleanFeeId = rawFeeId ? rawFeeId.padStart(10, '0') : '';

    const numFrom = parseFloat(slab.FromAmount || slab.fromAmount || 0);
    const numTo = parseFloat(slab.ToAmount || slab.toAmount || 99999999);
    const numPercent = parseFloat(slab.FeePercent || slab.FeePersent || slab.feePercent || 0);

    const payload = {
      FeeId: cleanFeeId,
      ConsultantId: cleanConsultantId,
      FeePersent: numPercent.toFixed(2),
      FromAmount: numFrom.toFixed(2),
      ToAmount: numTo.toFixed(2),
    };

    const primaryUrl = cleanFeeId
      ? `/FeesSet('${cleanFeeId}')`
      : `/FeesSet(ConsultantId='${cleanConsultantId}')`;

    try {
      const response = await sapClient.put(primaryUrl, payload);
      updateResults.push({ slab, status: 'SUCCESS', sapData: response.data?.d || response.data });
    } catch (err1) {
      try {
        const secondaryUrl = `/FeesSet(ConsultantId='${cleanConsultantId}',FeeId='${cleanFeeId}')`;
        const response2 = await sapClient.put(secondaryUrl, payload);
        updateResults.push({ slab, status: 'SUCCESS', sapData: response2.data?.d || response2.data });
      } catch (err2) {
        try {
          const fallbackUrl = `/FeeSet('${cleanFeeId}')`;
          const response3 = await sapClient.put(fallbackUrl, payload);
          updateResults.push({ slab, status: 'SUCCESS', sapData: response3.data?.d || response3.data });
        } catch (err3) {
          updateResults.push({
            slab,
            status: 'ERROR',
            error: err3?.response?.data?.error?.message?.value || err3?.message,
          });
        }
      }
    }
  }

  return {
    success: true,
    message: 'CTC Slab Matrix updated successfully in SAP FEESSET_UPDATE_ENTITY',
    results: updateResults,
  };
}
