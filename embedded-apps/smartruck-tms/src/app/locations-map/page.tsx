'use client';

import React from 'react';
import { PageHead } from '../../components/ui';
import PlantMap from '../../components/map/PlantMap';

export default function LocationsMapPage() {
  return (
    <div className="space-y-4">
      <PageHead title="Plant Map" sub="Every SAP plant, depot, MWH and unit on the map, from the plant master (T001W)" />
      <PlantMap />
    </div>
  );
}
