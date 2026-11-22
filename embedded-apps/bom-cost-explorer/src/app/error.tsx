'use client';
/** Last-resort screen for an unexpected error while drawing a page: says what happened (instead of a blank "Application error") and lets the person retry. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center bg-bg p-4">
      <div role="alert" className="w-full max-w-lg rounded-2xl border border-line border-l-4 border-l-bad bg-panel p-6 shadow-card">
        <h1 className="text-lg font-extrabold">This screen could not be displayed</h1>
        <p className="mt-1 text-sm text-muted">Something unexpected went wrong while drawing the page. Your data was not changed. Please try again; if it keeps happening, send the text below to the developer.</p>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-sunken p-3 text-xs text-ink">{error?.message || 'Unknown error'}{error?.digest ? `\n(${error.digest})` : ''}</pre>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={reset} className="inline-flex h-9 items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep px-4 text-sm font-semibold text-white">Try again</button>
          <button type="button" onClick={() => window.location.reload()} className="inline-flex h-9 items-center rounded-xl border border-line bg-panel px-4 text-sm font-semibold">Reload</button>
        </div>
      </div>
    </div>
  );
}
