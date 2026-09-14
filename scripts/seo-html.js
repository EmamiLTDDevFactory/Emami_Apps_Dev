// Shared by scripts/inject-seo-tags.js (build-time — patches dist/index.html
// on disk so ANY static host serves correct tags, no server required) and
// server/index.js (runtime — a redundant safety net for local/Render
// testing). One definition, so the two never drift out of sync.
const SITE_URL = process.env.SITE_URL || 'https://www.emamiapps.in';

const SEO_TITLE = 'Emami Apps – Emami Group Employee Portal';
const SEO_DESCRIPTION =
  "Emami Apps is the single sign-on portal for Emami Group's internal business applications — including Non CTC Expense, RC Portal, Dispatch Tracker, and MoldHealthCheck. Sign in with your Emami Microsoft work account.";

function buildSeoHeadTags() {
  return `
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">
    <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
    <link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <meta name="description" content="${SEO_DESCRIPTION}">
    <link rel="canonical" href="${SITE_URL}/">
    <meta property="og:title" content="${SEO_TITLE}">
    <meta property="og:description" content="Single sign-on portal for Emami Group's internal business applications.">
    <meta property="og:url" content="${SITE_URL}/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Emami Apps">
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Emami Apps',
      url: SITE_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: SEO_DESCRIPTION,
      publisher: { '@type': 'Organization', name: 'Emami Group', url: 'https://www.emamigroup.com' },
    })}</script>
`;
}

// Idempotent: if the description tag is already present (e.g. the file was
// already patched at build time, and this runs again at server startup),
// returns the HTML unchanged instead of appending a second copy of everything.
function injectSeoTags(html) {
  if (html.includes('name="description"')) return html;

  // Expo's own web build injects a single generic <link rel="icon" ...> —
  // strip it so it doesn't fight with the sized set below in the browser tab.
  const withoutDefaultIcon = html.replace(/\s*<link rel="(?:shortcut icon|icon)"[^>]*>\n?/gi, '');

  const withTitle = withoutDefaultIcon.includes('<title>')
    ? withoutDefaultIcon.replace(/<title>[^<]*<\/title>/, `<title>${SEO_TITLE}</title>`)
    : withoutDefaultIcon.replace('</head>', `  <title>${SEO_TITLE}</title>\n  </head>`);

  return withTitle.replace('</head>', `${buildSeoHeadTags()}  </head>`);
}

module.exports = { injectSeoTags, SEO_TITLE, SEO_DESCRIPTION, SITE_URL };
