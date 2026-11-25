import jwt from 'jsonwebtoken';

// Must match the Emami Apps hub's own HUB_AUTH_JWT_SECRET (backend/sessionAuth.js at the repo
// root) exactly - same shared-secret pattern every embedded app's backend uses (see Timesheet's
// server/src/middleware/auth.js) to trust a session the hub already authenticated, without ever
// calling back to the hub itself. The hub's token payload is just { email }.
const HUB_AUTH_JWT_SECRET = process.env.HUB_AUTH_JWT_SECRET || '';

// Same SAP OData base the frontend uses (src/config/api.ts) - kept here too so this middleware
// can resolve identity server-side without depending on the frontend's own config module.
const SAP_BASE_URL = process.env.SAP_BASE_URL
  || 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFI_EXPCLAIM_SRV';

if (!HUB_AUTH_JWT_SECRET) {
  console.warn('[hub-auth] HUB_AUTH_JWT_SECRET is not set - every proxied request will be rejected.');
}

/**
 * Verifies the Emami Apps hub's session JWT, then resolves the REAL employee identity server-side
 * via SAP's own LoginSet, keyed only by the verified email from the token - never trusts an
 * EmpId/LoginId/isAdmin value the browser sends. This is the one place identity gets decided for
 * every route behind it; req.hubUser is what those routes build their own SAP filters from.
 */
export async function requireHubAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Not signed in to Emami Apps.' });
  if (!HUB_AUTH_JWT_SECRET) return res.status(503).json({ error: 'Server is not configured to verify sessions yet.' });

  let payload;
  try {
    payload = jwt.verify(token, HUB_AUTH_JWT_SECRET);
  } catch (err) {
    if (err?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Your Emami Apps session has expired. Please sign in again.' });
    }
    console.error(`[hub-auth] token rejected: ${err?.name}: ${err?.message}`);
    return res.status(401).json({ error: 'Could not verify your Emami Apps session.' });
  }

  const email = String(payload?.email || '').trim().toLowerCase();
  if (!email) return res.status(401).json({ error: 'Invalid Emami Apps session.' });

  try {
    const sapRes = await fetch(`${SAP_BASE_URL}/LoginSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'DataServiceVersion': '2.0' },
      body: JSON.stringify({ LoginId: '', Otp: '', Email: email }),
    });
    const raw = await sapRes.json().catch(() => ({}));
    const sap = raw?.d || raw || {};
    const sapErrorType = (sap.Type || sap.type || '').toString().toUpperCase();
    if (!sapRes.ok || sapErrorType === 'E') {
      return res.status(403).json({ error: 'No Expense access found for this Emami Apps account.' });
    }

    const loginIdRaw = (sap.LoginId || sap.EmployeeId || sap.PERNR || sap.Pernr || '').toString().trim();
    if (!loginIdRaw) return res.status(403).json({ error: 'No Expense access found for this Emami Apps account.' });

    // Same normalization the frontend already applies before using an employeeId in a SAP filter
    // (see src/context/ClaimContext.tsx's fetchClaims) - 8-digit zero-padded PERNR.
    const loginId = loginIdRaw.replace(/\D/g, '').padStart(8, '0');

    req.hubUser = {
      email,
      loginId,
      name: sap.Name || '',
      isAdmin: sap.IsAdmin === true || sap.IsAdmin === 'X' || sap.IsAdmin === 'Y' || sap.IsAdmin === '1',
    };
    next();
  } catch (err) {
    next(err);
  }
}
