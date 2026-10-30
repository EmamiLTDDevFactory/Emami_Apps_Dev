import React from 'react';
import { areasByLandscape } from './masterData.js';

/** <option>s for a Module (area) <select>, grouped under SAP / Non-SAP (Master Data › Area). */
export default function AreaOptions({ values, groupOf }) {
  return areasByLandscape(values, groupOf).map(([g, list]) => (
    <optgroup key={g} label={g}>
      {list.map((a) => <option key={a} value={a}>{a}</option>)}
    </optgroup>
  ));
}
