import React from 'react';

/** Polished placeholder for a nav destination whose backend/data model isn't built yet
 * (currently just Settings). Renders inside a page's .shell-main, next to
 * <Sidebar/>, so the destination looks and feels finished even before it does anything. */
export default function ComingSoon({ icon: IconComp, eyebrow, title, description, bullets, tone = 'accent' }) {
  return (
    <div className="coming-soon">
      <div className={`coming-soon-icon tone-${tone}`}>
        <IconComp size={26} />
      </div>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="h1" style={{ marginTop: 4 }}>{title}</h1>
      <p className="coming-soon-desc">{description}</p>
      {bullets?.length > 0 && (
        <ul className="coming-soon-list">
          {bullets.map((b) => <li key={b}>{b}</li>)}
        </ul>
      )}
      <span className="coming-soon-badge">In development</span>
    </div>
  );
}
