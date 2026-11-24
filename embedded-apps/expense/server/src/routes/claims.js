import { Router } from 'express';
import { requireHubAuth } from '../middleware/hubAuth.js';

const SAP_BASE_URL = process.env.SAP_BASE_URL
  || 'https://emdcindpwebapp1-bag2gfhjd9d4gkh6.centralindia-01.azurewebsites.net/api/NGD/ZFI_EXPCLAIM_SRV';

const router = Router();

// Returns SAP's own raw ClaimHeaderSet JSON unchanged - the frontend's existing
// mapSapClaimToExpenseClaim transform stays exactly as-is, only the transport (our server instead
// of the browser calling SAP directly) changes. LoginId always comes from req.hubUser (resolved
// server-side from the verified hub session), never from anything the client sends - this is what
// actually stops someone from asking for a different employee's claims by typing a different id.
router.get('/claims', requireHubAuth, async (req, res, next) => {
  try {
    const filter = encodeURIComponent(`LoginId eq '${req.hubUser.loginId}'`);
    const sapRes = await fetch(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
    const data = await sapRes.json().catch(() => ({}));
    if (!sapRes.ok) {
      return res.status(502).json({ error: 'Failed to fetch claims from SAP.' });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Admin claim search - req.hubUser.isAdmin is resolved server-side from SAP's own LoginSet
// response, never trusted from the client, so this can't be reached just by a browser claiming
// isAdmin:true. At least one of claimId/empId/empName/status/costCenter is required, matching the
// backend's own ClaimHeaderSet requirement.
router.get('/admin/claims', requireHubAuth, async (req, res, next) => {
  if (!req.hubUser.isAdmin) {
    return res.status(403).json({ error: 'Not authorised for admin claim search.' });
  }
  try {
    const { claimId, empId, empName, status, costCenter } = req.query;
    const parts = [`Zview eq 'ADMIN'`, `LoginId eq '${req.hubUser.loginId}'`];
    if (claimId) parts.push(`ClaimId eq '${String(claimId).trim()}'`);
    if (empId) parts.push(`EmpId eq '${String(empId).trim()}'`);
    if (status) parts.push(`Status eq '${String(status).trim()}'`);
    if (costCenter) parts.push(`CostCenter eq '${String(costCenter).trim()}'`);
    if (empName) parts.push(`EmpName eq '${String(empName).trim()}'`);
    if (parts.length === 2) {
      return res.status(400).json({ error: 'Enter at least one of Claim ID, Employee ID, Employee Name, Status or Cost Centre to search.' });
    }
    const filter = encodeURIComponent(parts.join(' and '));
    const sapRes = await fetch(`${SAP_BASE_URL}/ClaimHeaderSet?$filter=${filter}&$expand=CLAIMNAV&$format=json`);
    const data = await sapRes.json().catch(() => ({}));
    if (!sapRes.ok) {
      const errMsg = data?.error?.message?.value || data?.error || 'Admin claim search failed';
      return res.status(502).json({ error: errMsg });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Admin reject - Aenam/LoginId/Zview all come from req.hubUser, same reasoning as above: the
// person performing the reject is whoever the verified hub session resolves to, not whoever the
// request body claims.
router.post('/admin/claims/:claimId/reject', requireHubAuth, async (req, res, next) => {
  if (!req.hubUser.isAdmin) {
    return res.status(403).json({ error: 'Not authorised for admin claim reject.' });
  }
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Rejection reason is required.' });

    const putData = {
      ClaimId: req.params.claimId,
      LoginId: req.hubUser.loginId,
      Zview: 'ADMIN',
      ApprovalRequired: 'R',
      RejReason: reason,
    };
    const sapRes = await fetch(`${SAP_BASE_URL}/ClaimHeaderSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putData),
    });
    const raw = await sapRes.json().catch(() => ({}));
    const data = raw?.d || raw || {};
    if (!sapRes.ok) {
      const errMsg = raw?.error?.message?.value || data?.Message || 'Admin reject failed';
      return res.status(502).json({ error: errMsg });
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
