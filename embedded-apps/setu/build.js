// Writes dist/index.html and dist/portal/index.html: forwarders from the pre-v7 /apps/setu/... (formerly Setu) to the
// same path under /apps/samadhan/..., keeping ?ticket= / ?csat= and #hash. scripts/build-embedded-apps.js merges dist/
// into the hub at dist/apps/setu/ like any other embedded app.
const fs = require('fs');
const path = require('path');

const OLD = '/apps/setu';
const NEW = '/apps/samadhan';

// The page script uses a plain prefix check (no regular expression): /apps/setu, /apps/setu/ and /apps/setu/<rest>
// become the same under /apps/samadhan; anything else goes to the fallback.
const page = (fallback) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Samadhan</title>
<script>
(function () {
  var l = window.location, OLD = '${OLD}', NEW = '${NEW}', p = l.pathname;
  var next = (p === OLD || p.indexOf(OLD + '/') === 0) ? NEW + p.slice(OLD.length) : '${fallback}';
  l.replace(next + l.search + l.hash);
})();
</script>
<noscript><meta http-equiv="refresh" content="0; url=${fallback}"></noscript>
</head>
<body style="font-family: system-ui, sans-serif; padding: 24px">
<p>Samadhan has moved. If nothing happens, <a href="${fallback}">open Samadhan</a>.</p>
</body>
</html>
`;

const dist = path.join(__dirname, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'portal'), { recursive: true });
fs.writeFileSync(path.join(dist, 'index.html'), page(`${NEW}/`));
fs.writeFileSync(path.join(dist, 'portal', 'index.html'), page(`${NEW}/portal/`));
console.log('Wrote dist/index.html and dist/portal/index.html (forwarding /apps/setu -> /apps/samadhan)');
