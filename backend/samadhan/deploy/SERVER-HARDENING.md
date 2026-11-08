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
