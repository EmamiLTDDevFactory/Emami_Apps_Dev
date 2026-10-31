/** Standard cost (CK13N) page. Off by default; next.config.mjs sets it for the deployed build. Off = no nav item, no request, no code in any bundle. */
export const CK_ENABLED = String(process.env.NEXT_PUBLIC_CK_ENABLED ?? 'false').toLowerCase() === 'true';
