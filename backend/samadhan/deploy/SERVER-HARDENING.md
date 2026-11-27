# Server hardening for the Emami Apps API (for the server admin and the hub owner)

These are the items from the 2026-11-08 Samadhan security review (`docs/v7/SECURITY-REVIEW.md`) that need root on
172.17.2.21, or a change to the shared hub backend. Samadhan works without them; they harden every app behind the API.
Apply them on dev first, check the apps, then repeat on production.

## 1. nginx: Samadhan route (dev)

Run `sudo bash deploy/add-samadhan-nginx-route.sh`. It backs up the config, adds `location /dev-api/api/samadhan/`, then
runs `nginx -t` and reloads.

Until then, Samadhan automatically uses the older route that nginx already forwards (`TRANSPORT_PATH` in `index.js`).

## 2. nginx: security headers and edge rate limits

The file is `/etc/nginx/sites-available/audit-capa-api.emamiapps.in.conf`.

**In the `http { }` block of `/etc/nginx/nginx.conf`, once:**

```nginx
# Edge rate limits for the public (no sign-in) routes: portal, webhooks, approval links.
limit_req_zone $binary_remote_addr zone=public_api:10m rate=30r/m;
```

**In the `server { listen 443 ... }` block of the API site:**

```nginx
# The API answers JSON only: no framing, no sniffing, no referrer leaks, HTTPS remembered for a year.
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
server_tokens off;

# Public routes on DEV: 30 a minute per address, short bursts allowed (the apps' own limits stay as the second line).
# A regex location wins over the prefix blocks, so only these public paths get the edge limit. Add it together with
# the Samadhan route (step 1).
location ~ ^/dev-api/api/samadhan/(portal|whatsapp|integrations)/ {
    limit_req zone=public_api burst=20 nodelay;
    limit_req_status 429;
    rewrite ^/dev-api/(.*)$ /$1 break;          # the dev backend (port 4001) expects /api/..., without /dev-api
    proxy_pass http://localhost:4001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

The production block is only needed once Samadhan is on production. It is the same, without the `/dev-api` prefix and the
rewrite, and `proxy_pass` points at the production hub port.

- An `add_header` inside a `location` replaces the server-level headers for that location. If a location already has its own `add_header` lines, repeat the four headers there.
- With nginx's `$proxy_add_x_forwarded_for`, Samadhan's rate limits use the last `X-Forwarded-For` entry, which is the address nginx saw. Keep that directive as it is.

**Then:**

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Check that the apps still work on dev, for example `curl -sI https://audit-capa-api.emamiapps.in/dev-api/api/samadhan/portal/config` shows the new headers.

## 3. Content-Security-Policy for the web apps (Amplify, not nginx)

`dev.emamiapps.in` and `emamiapps.in` are served by AWS Amplify, so the CSP is a custom header in the Amplify app (`customHttp.yml` or console > Hosting > Custom headers).

1. Start with **Report-Only** for a week, so nothing breaks:

   ```yaml
   customHeaders:
     - pattern: '**/*'
       headers:
         - key: Content-Security-Policy-Report-Only
           value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://audit-capa-api.emamiapps.in https://login.microsoftonline.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
   ```

2. Then switch the key to `Content-Security-Policy`.

This matters because the hub session token is kept in `localStorage`, which every app on the same site shares: an injected script in any one app could read it. A CSP that only allows the site's own scripts blocks that.

## 4. Shared hub backend (`backend/server.js`), for the hub owner

| Change | Why |
|---|---|
| `app.disable('x-powered-by')` | Don't advertise Express. |
| `app.set('trust proxy', 1)` | `req.ip` becomes the client address (nginx is the one proxy), for every app's logs and limits. |
| `app.use(require('helmet')({ contentSecurityPolicy: false }))` | Standard headers on API responses. The CSP stays at Amplify (above). |
| Lower `express.json({ limit: '6mb' })` to about 1 MB, raising it only on the routes that take uploads | Smaller payloads for routes that don't need them. |
| If the limit is lowered: keep 6 MB on `POST /api/samadhan/admin/migration/:kind/import` | The ticket migration sends the checked sheet (up to 5,000 rows) in one request; the page refuses files over 5.5 MB. |

Samadhan does not depend on any of these, so they can go in at any time.

## 5. Static asset caching (performance)

On Amplify, `/_next/static/*` files have content hashes in their names, so they can be cached for a year:

```yaml
    - pattern: '**/_next/static/**'
      headers:
        - key: Cache-Control
          value: 'public, max-age=31536000, immutable'
```

Leave the `index.html` pages uncached (`no-cache`), so a new deploy is picked up at once.

## 6. Company-wide use: load balancing, proxy, scaling

Samadhan is safe to run as **several backend copies behind a load balancer** (PM2 cluster, two VMs, or containers):

| Concern | How Samadhan handles it | What the admin sets up |
|---|---|---|
| Sessions | Stateless: every request carries the hub JWT; no server session, so no sticky sessions are needed. | Round robin / least connections is fine. |
| Scheduled checks (mail, SLA, escalations, reminders) | One Postgres advisory lock (`samadhan.scheduled_jobs`): only one copy runs them at a time. | Nothing. |
| Ticket migration import | Advisory lock `samadhan.ticket_migration`: a second import waits (409) instead of duplicating tickets. | Nothing. |
| Rate limits | Per person, in memory per copy (read 300 / write 60 / heavy 10 / AI 20 a minute). With N copies the real limit is up to N times higher. | Keep the nginx / gateway limits (section 2) as the shared first line. |
| Client address | Rate limits and logs key on the last `X-Forwarded-For` address the proxy added. | Exactly one proxy hop adds it; `trust proxy` = 1 (section 4). Never pass a client-supplied XFF through unchanged. |
| Caches (settings 30 s, catalogue / permissions 60 s) | Per copy, short-lived: an Admin change reaches every copy within a minute. | Nothing. |
| Database connections | One shared pool per copy. | Size Postgres `max_connections` ≥ copies × pool size + 20; use PgBouncer (transaction mode) beyond ~4 copies. |
| Health check | `GET /api/samadhan/portal/config` answers 200 without sign-in. | Point the load balancer health check there; take a copy out after 3 failures. |
| Timeouts | Heavy calls (export, reports, import) can take 30–60 s. | Proxy / LB read timeout ≥ 120 s on `/api/samadhan/`. |
| TLS | — | TLS 1.2+ only at the LB / nginx, HSTS (section 2), modern ciphers; HTTP → HTTPS redirect. |

## 7. Security testing (VAPT) checklist before go-live

Run on **dev / UAT**, never on production data. Findings go to the Samadhan owner; retest after fixes.

1. **Scope:** web app (`/apps/samadhan/`, portal, approval and CSAT links), API `/api/samadhan/*`, inbound
   integrations (Cloud ALM, monitoring, WhatsApp webhook), the server (nginx, Node, Postgres ports, SSH).
2. **Authentication / session:** expired, tampered and other-app JWTs → 401; Samadhan access removed in Manage Access →
   403 at once; no token in URLs except the single-use approval / CSAT links (hashed in the database, expire).
3. **Authorisation (IDOR):** as an Agent with a narrowed data scope, call `/tickets/<id>`, `/tickets/<id>/escalations`,
   `/tickets/<id>/support-vendor`, attachments of tickets outside the scope → 404; Admin routes (`/admin/*`, incl.
   Support model and Ticket migration) → 403 for Agent / Supervisor. `tests/permissions.test.js` proves every route
   has a permission rule.
4. **Injection:** SQL (all queries are parameterised; try quotes in search, filters, import cells), stored XSS in
   subjects, notes, email bodies, knowledge articles (DOMPurify in the browser, escaping in mails), Excel formula
   injection in exports / templates / report cards (cells starting with `= + - @` are stored as text).
5. **Uploads:** attachment type / size / magic-byte checks, malware scan on the SFTP store, path traversal in names.
6. **Rate limits / DoS:** bursts on portal, login-free routes and heavy routes → 429 with `Retry-After`; large bodies
   (> 6 MB) → 413.
7. **Transport and headers:** TLS scan (e.g. testssl.sh), HSTS, `X-Content-Type-Options`, `X-Frame-Options`, CSP on
   the web apps (section 3), no `X-Powered-By`, no stack traces in error bodies (Samadhan returns plain messages).
8. **Secrets:** no keys in the repo or the static site; integration keys stored hashed, shown once; rotate the
   passwords that were shared in chat during the build; `.env` readable only by the service user.
9. **Infrastructure:** only 80/443 open to users; Postgres and PM2 ports closed outside the server; OS and Node
   patches current; `npm audit` for the backend and the Samadhan app (xlsx is pinned to the patched 0.20.3).
10. **Logging / audit:** Admin changes (support model, escalation matrix, migrations, access) are in Admin > Audit log;
    keep server logs 90 days; alert on many 401 / 403 / 429 from one address.
