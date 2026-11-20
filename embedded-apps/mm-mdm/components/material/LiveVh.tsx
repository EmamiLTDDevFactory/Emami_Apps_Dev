'use client';

import { useValueHelp } from '@/lib/mmValueHelp';
import { ValueHelpField } from '../ValueHelp';

/** A value-help field backed by one live SAP list (GET /valuehelp/<name>) */
export default function LiveVh({ id, label, tech, name, params = {}, enabled = true, value, onChange, required, disabledHint }: {
  id: string; label: string; tech?: string; name: string; params?: Record<string, string>; enabled?: boolean;
  value: string; onChange: (v: string) => void; required?: boolean; disabledHint?: string;
}) {
  const vh = useValueHelp(name, params, enabled);
  return (
    <>
      <ValueHelpField
        id={id}
        label={label}
        tech={tech}
        required={required}
        value={value}
        options={vh.options}
        onChange={onChange}
        disabled={!enabled || vh.loading || !!vh.error || vh.options.length === 0}
        disabledHint={!enabled ? disabledHint : vh.loading ? 'Loading the list from SAP…' : vh.error || (vh.options.length === 0 ? 'SAP returned no values' : undefined)}
      />
      {vh.error && <button type="button" className="btn btn-ghost btn-sm vh-retry" onClick={() => void vh.retry()}>Try again</button>}
    </>
  );
}
