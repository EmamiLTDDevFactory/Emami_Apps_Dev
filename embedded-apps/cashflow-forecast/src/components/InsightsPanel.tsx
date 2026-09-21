'use client';

import { Sparkles, Zap, CircleCheck } from 'lucide-react';
import type { Insight } from '../types';

const priorityClass: Record<Insight['priority'], string> = {
  Critical: 'critical',
  High: 'high',
  Medium: 'medium',
  Info: 'low',
};

interface Props {
  insights: Insight[];
  created: Record<string, string>; // insightId -> ACT id
  onCreate: (insight: Insight) => void;
  busyId?: string;
}

/** Agent-generated, ranked insights with one-click governed actions. */
export default function InsightsPanel({ insights, created, onCreate, busyId }: Props) {
  return (
    <section className="card" id="insights">
      <div className="card-head">
        <h2>
          <Sparkles size={18} /> AI Insights &amp; Recommended Actions
        </h2>
        <span className="chip">
          {insights.filter((i) => i.priority === 'Critical' || i.priority === 'High').length} priority items · updated per run
        </span>
      </div>
      <p className="card-sub">
        Insights are derived deterministically from the forecast run (rules + behaviour model) and ranked by financial impact. Every action is a
        governed work item — nothing executes in SAP without approval.
      </p>
      <div className="insight-grid">
        {insights.map((i) => {
          const actionId = created[i.id];
          const busy = busyId === i.id;
          return (
            <article key={i.id} className={`insight prio-${priorityClass[i.priority]}`}>
              <header>
                <h3>{i.title}</h3>
                <span className={`pill ${priorityClass[i.priority]}`}>{i.priority}</span>
              </header>
              <p className="insight-detail">{i.detail}</p>
              <div className="insight-meta">
                <span className="chip in">Impact ₹{i.impact.toFixed(1)} Cr</span>
                <span className="conf">
                  <span className="prob-bar">
                    <span className="prob-fill" style={{ width: `${i.confidence}%` }} />
                  </span>
                  {i.confidence}% confidence
                </span>
              </div>
              <div className="insight-sources">
                {i.sources.map((s) => (
                  <span key={s} className="src-tag">
                    {s}
                  </span>
                ))}
              </div>
              <p className="insight-action">
                <strong>Recommended:</strong> {i.suggestedAction}
              </p>
              <footer>
                {i.actionType ? (
                  actionId ? (
                    <span className="done">
                      <CircleCheck size={15} /> Action created · {actionId}
                    </span>
                  ) : (
                    <button className="btn" onClick={() => onCreate(i)} disabled={busy}>
                      <Zap size={14} /> {busy ? 'Creating…' : 'Create action'}
                    </button>
                  )
                ) : (
                  <span className="done">Monitored — no action required</span>
                )}
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
