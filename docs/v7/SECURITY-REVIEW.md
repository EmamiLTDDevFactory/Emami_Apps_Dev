# Samadhan security review (2026-11-08)

A read-only review of Samadhan's own code in four areas:
- sign-in and access
- public endpoints
- AI / LLM
- frontend and configuration

Each finding was checked against the code. The fixes are in the commit that adds this file. Each one has a test or was
checked by hand, and the gate is green.

## Fixed

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | **Scope bypass with a non-digit ticket id.** `GET /tickets/100000.0` (or `1e5`, `0x186a0`) skipped the desk / own / confidential scope check, but the handler still read it as ticket 100000. | The permission gate answers 404 unless a ticket id in the path is plain digits (or a named route such as `bulk`). Test in `change.api.test.js`. |
| 2 | High | **Self-approval through the manager step.** The portal (and agents) could name any outside address as the "manager", so a requester could approve their own access request from a second mailbox. | The manager must be a company address: `@emamigroup.com`, or the domains in `SAMADHAN_APPROVER_DOMAINS`. It also can't be the requester, the agent starting the chain, or the assignee. Tests added. |
| 3 | Medium | **Spoofed `X-Forwarded-For` beat the public rate limits.** This covered portal submit / status, approval and CSAT links, uploads and integration keys. | `clientIp()` takes the last `X-Forwarded-For` entry, which is the address nginx itself saw. |
| 4 | Medium | **Forged sender could open a ticket in someone else's name.** A mail failing DMARC/SPF opened a new ticket, and a forged lower `Authentication-Results: dkim=pass` header could hide an SPF fail. | Unverified senders are parked for new tickets too, not only replies. Only the top-most `Authentication-Results` header counts. Unit test added. |
| 5 | Medium | **AI mail routing was open to prompt injection and saw confidential mail.** | The email is fenced as untrusted data, with an instruction to ignore what it asks for. Payroll / tax / identity / password / security mails never go to the AI. AI-routed tickets were already always shown in "Needs classification". |
| 6 | Medium | **Private notes could leak into the AI's suggested reply.** | The prompt rule says notes are internal and never go into the reply. |
| 7 | Medium | **Permission keys not enforced.** `ticket.child` wasn't checked for child tickets, and `ticket.assign` wasn't checked on bulk reassignment. | Both are added to the rules. Agents have both by default. |
| 8 | Medium-low | **Anyone could block the scheduler.** `/jobs/run` applied its rate limit before checking the caller, so anonymous requests used up the scheduler's allowance. | The secret / Admin check runs first, then the limit, keyed per caller. |
| 9 | Low | **Dashboard AI summary counted confidential tickets** and was shown to everyone. | Every dashboard query leaves confidential tickets out. |
| 10 | Low | **Redaction sent URLs with tokens, passwords, PAN, IFSC, Aadhaar and account numbers.** | Query strings are dropped, and those patterns are masked. |
| 11 | Low | **Raw database and SFTP error text reached clients**, naming tables, constraints, the host and paths. | Plain messages go to the client; the detail goes to the server log only. |
| 12 | Low | **Remote CSS `url(...)` in mail bodies loaded tracking pixels**, and `transform` / negative margins allowed overlays. | Held back like remote images, and the overlay styles are dropped. |
| 13 | Low | **Two people could decide the same approval link at once.** | The update only applies while the step is still Pending with the same token; otherwise 409. |
| 14 | Low | **Integration keys and the WhatsApp verify token weren't compared in constant time.** | Changed to `timingSafeEqual`. |
| 15 | Low | **A flood of bad keys could push real calls out of the integration call log.** | Refused calls (401) keep only their newest 50 rows. |
| 16 | Low | **`/registers/constructor` returned a 500**, and `/tickets/export/` (trailing slash) escaped the heavy rate-limit bucket. | `Object.hasOwn`; trailing slashes are normalised. |
| 17 | Medium | **Ticket ids sent in request bodies skipped the scope check.** These are problem `incidentIds` / `problemId` and to-do `ticketId`, plus the linked / child / parent lists on ticket detail and the subject shown on to-dos. They exposed subjects and statuses, including of confidential tickets. | `ticketVisible` is checked on body ids, and the related lists and to-do subjects are filtered by the caller's scope. |

## Open: decisions or other owners

- **`ticket.overridePriority` is not enforced.** It is Supervisor-only in the catalogue, but agents set priority today, and tests rely on it (Urgent + Production flags a major incident). It's a product decision whether agents should lose that.
- **`xlsx` 0.18.5 has known file-parsing CVEs** (CVE-2023-30533, CVE-2024-22363). It is used only for admin uploads in the browser. Upgrade to `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, as cascade-pricing and expense already do. Not done here because installing from an outside URL needs approval.
- **The portal can be used to send spam from the helpdesk mailbox.** Anyone can raise a portal ticket for any address, and the acknowledgement comes from the Emami mailbox. Current limits are 10 per address per day and 300 per hour for the whole portal. The fix is an email OTP before the ticket is created: a feature, not done here.
- **The problem-candidates list isn't filtered by scope.** It is only reachable with `problem.manage`, which supervisors hold.
- **AI cost controls.** `?generate=1` always calls the model, with `max_tokens` 16000. A per-desk daily cap is advisable before turning AI on widely.
- **CSAT survey tokens** don't expire and are stored in plain text. They are 192-bit random. An expiry needs a migration.

## For the hub and server owners (not Samadhan code)

- **nginx:**
  - add the `/dev-api/api/samadhan/` route
  - add security headers: HSTS, `X-Content-Type-Options`, `frame-ancestors`, `Referrer-Policy`
  - add a Content-Security-Policy for the static apps (`script-src 'self'`; `connect-src` set to the API host)
  - add edge rate limits (`limit_req`) for the `/api/*/portal` and webhook paths
  - consider short caching of static `/_next/static/*` assets
- **Shared `backend/server.js`:**
  - add `helmet()`
  - turn off `x-powered-by`
  - add `app.set('trust proxy', 1)` so `req.ip` is the client
  - lower the global 6 MB JSON body limit where it isn't needed
- **Hub token in shared same-origin `localStorage`:** an XSS in any embedded app can read the session for all apps. A CSP (above) is the main mitigation.
