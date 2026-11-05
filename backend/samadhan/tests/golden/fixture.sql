-- Deterministic data for the golden files (daily report, export). Loaded AFTER the backend created its schema and seed.
-- {{S}} is the schema name (setu before v7.0, samadhan after). Fixed ids and October 2026 timestamps (all in the past,
-- so SLA texts never depend on "now"). Covers: every status family, null fields, HTML in long text, formula-like text
-- (safeCell), unicode, a deactivated agent, phone-only requester, spam and trashed tickets (must not appear).
BEGIN;
-- Scheduled checks would close resolved / waiting tickets (TIME automations) and change the report between runs:
-- a "last run" far in the future makes runJobs() skip, without touching any rule.
INSERT INTO {{S}}.settings (key, value) VALUES ('jobs.lastRunAt', '99999999999999')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
INSERT INTO {{S}}.agents (id, name, email, role, active) VALUES
  (9001, 'Golden Agent One', 'golden.one@test.samadhan.local', 'Agent', true),
  (9002, 'Golden Agent Two', 'golden.two@test.samadhan.local', 'Agent', false);
INSERT INTO {{S}}.contacts (id, name, email, phone, mobile) VALUES
  (9101, 'Ravi Kumar', 'ravi@test.samadhan.local', NULL, '+91 98300 00001'),
  (9102, '=HYPERLINK("x")', 'formula@test.samadhan.local', '033-1234', NULL),
  (9103, 'Phone Only', NULL, NULL, '+91 90000 00003');
INSERT INTO {{S}}.tickets (id, subject, description, "requesterId", "statusId", priority, severity, source, type, "agentId",
  "callSubject", region, "distributorCode", "distributorName", "salesOrg", state, depot, "asmName", "depotCoordinator", "mrUid",
  "mobileNo", "alternateMobileNo", "callerName", "callerContactNumber", category, "function", "l2Agent", "helpdeskAnalysis", "rcaSolution",
  "firstResponseDueAt", "resolutionDueAt", "firstRespondedAt", "resolvedAt", "closedAt", "createdAt", "updatedAt", "statusChangedAt",
  "frViolated", "resViolated", spam, "deletedAt") VALUES
  (900001, 'Cannot log in to mSecSales', 'Login fails', 9101, 5, 4, 'FATAL', 'Email', 'mSFA', 9001,
   'Login', 'EAST', 'D100', 'Kolkata Traders', 'EM01 - CCD', 'WEST BENGAL', 'DP15-KOLKATA', 'ANIRBAN KAR', 'ANJU PATEL', 'MR001',
   '9830000001', '9830000002', 'Ravi', '9830000001', 'mSecSales Application - Login Screen', 'Login / Password Related issue', 'Anish Basu',
   '<p>Checked <b>SAP</b> user</p>', '<p>Password reset &amp; unlocked</p>',
   '2026-10-01 10:15:00+05:30', '2026-10-01 14:00:00+05:30', '2026-10-01 10:05:00+05:30', '2026-10-01 12:00:00+05:30', '2026-10-03 12:00:00+05:30',
   '2026-10-01 10:00:00+05:30', '2026-10-03 12:00:00+05:30', '2026-10-03 12:00:00+05:30', false, false, false, NULL),
  (900002, '=SUM(A1:A9) order not syncing', '', 9102, 2, 3, 'SERIOUS', 'Phone', 'SalesCode DMS', 9002,
   NULL, 'NORTH', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, 'Secondary Sales', 'Create Sales Order', NULL, NULL, NULL,
   '2026-10-02 11:00:00+05:30', '2026-10-02 18:00:00+05:30', NULL, NULL, NULL,
   '2026-10-02 10:00:00+05:30', '2026-10-02 10:00:00+05:30', '2026-10-02 10:00:00+05:30', true, true, false, NULL),
  (900003, 'Scheme claim – ₹ 1,250 मिलान नहीं', 'Unicode text', 9103, 12, 1, 'NORMAL', 'WhatsApp', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL,
   '2026-10-15 23:59:00+05:30', '2026-10-16 09:00:00+05:30', '2026-10-16 09:00:00+05:30', false, false, false, NULL),
  (900004, 'Resolved within SLA', 'ok', 9101, 4, 2, 'NORMAL', 'Portal', 'CDMS', 9001,
   NULL, 'SOUTH', 'D200', '+Plus Distributors', 'EM02 - HCD', 'KARNATAKA', 'DP03-BANGALORE', NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, 'Inventory', 'Create Stock Adjustment', NULL, NULL, '@mention text',
   '2026-10-20 14:00:00+05:30', '2026-10-22 18:00:00+05:30', '2026-10-20 11:00:00+05:30', '2026-10-21 10:00:00+05:30', NULL,
   '2026-10-20 10:00:00+05:30', '2026-10-21 10:00:00+05:30', '2026-10-21 10:00:00+05:30', false, false, false, NULL),
  (900005, 'Spam ticket', '', 9101, 2, 1, 'NORMAL', 'Email', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, '2026-10-05 10:00:00+05:30', '2026-10-05 10:00:00+05:30', '2026-10-05 10:00:00+05:30', false, false, true, NULL),
  (900006, 'Trashed ticket', '', 9101, 2, 1, 'NORMAL', 'Email', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, '2026-10-06 10:00:00+05:30', '2026-10-06 10:00:00+05:30', '2026-10-06 10:00:00+05:30', false, false, false, '2026-10-07 10:00:00+05:30'),
  (900007, 'Outside the range', '', 9101, 2, 1, 'NORMAL', 'Email', NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   NULL, NULL, NULL, NULL, NULL, '2026-11-01 00:00:00+05:30', '2026-11-01 00:00:00+05:30', '2026-11-01 00:00:00+05:30', false, false, false, NULL);
INSERT INTO {{S}}.csat_responses ("ticketId", rating, comment, "createdAt") VALUES (900001, 3, 'Great', '2026-10-03 13:00:00+05:30');
COMMIT;
