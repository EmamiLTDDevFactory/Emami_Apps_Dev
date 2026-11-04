import { MaterialData, ViewId } from '@/lib/types';
import { VIEW_BY_ID, displayValue, tableRows } from '@/lib/fieldConfig';
import { levelDef } from '@/lib/workflowConfig';
import { viewEditors } from '@/lib/service';
import { IconLayers } from './icons';

/** Read-only view of one or more material views, block by block as on the SAP screen */
export default function DataSummary({ data, views }: { data: MaterialData; views: ViewId[] }) {
  return (
    <div className="summary">
      {views.map((id) => {
        const v = VIEW_BY_ID[id];
        if (!v) return null;
        return (
          <section key={id}>
            <div className="block-head">
              <span className="block-icon"><IconLayers size={16} /></span>
              <h3>{v.label}</h3>
              <span className="muted small">{viewEditors(data.materialType, id).map((l) => `L${l} ${levelDef(l)?.team ?? ''}`).join(', ')}</span>
              <span className="tech">{v.table}</span>
            </div>
            {v.groups.map((g) => (
              <div key={g.title} className="summary-group">
                <h4>{g.title}</h4>
                <dl className="kv kv-tiles">
                  {g.fields.map((f) => {
                    const val = data[f.key] ?? '';
                    if (f.type === 'table' || f.type === 'attachments') {
                      const rows = tableRows(val);
                      return (
                        <div key={f.key} className="kv-wide">
                          <dt>{f.label}</dt>
                          <dd>
                            {rows.length === 0 ? <span className="muted">—</span> : (
                              <ul className="summary-rows">
                                {rows.map((r, i) => <li key={i}>{Object.values(r).filter(Boolean).join(' · ')}</li>)}
                              </ul>
                            )}
                          </dd>
                        </div>
                      );
                    }
                    return (
                      <div key={`${f.key}-${f.label}`} className={f.wide ? 'kv-wide' : ''}>
                        <dt>{f.label}</dt>
                        <dd>{displayValue(f.key, val, data) || <span className="muted">—</span>}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
