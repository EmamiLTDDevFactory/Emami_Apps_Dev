import { APPS, EMBEDDED_APP_URLS } from '../../../data/mockData';
import AppDetailClient from '../../../components/AppDetailClient';

/**
 * Every real app id, PLUS every embedded app's own URL slug (e.g. "dispatch-tracker" alongside its
 * hub id "hr") — needed because a static export has no server to fall back to for an unlisted
 * dynamic path. An embedded app's own boot process can redirect the browser to
 * `/apps/<slug>/` (trailing slash) rather than `/apps/<hubId>/`; without pre-rendering that slug
 * too, refreshing an already-open embedded app would 404 here instead of recovering via appById's
 * slug fallback (see mockData.ts). This has to live in a Server Component (this file must not have
 * a "use client" directive) — generateStaticParams isn't supported from a Client Component.
 */
export function generateStaticParams() {
  const ids = APPS.map((a) => a.id);
  const slugs = Object.values(EMBEDDED_APP_URLS)
    .filter((u) => u.startsWith('/apps/'))
    .map((u) => u.replace(/^\/apps\//, '').replace(/\/+$/, ''));
  return Array.from(new Set([...ids, ...slugs])).map((appId) => ({ appId }));
}

export default function AppDetailPage({ params }: { params: { appId: string } }) {
  return <AppDetailClient appId={params.appId} />;
}
