'use client';

import React from 'react';
import { PageHead } from '../../components/ui';
import LoadingOptimizer from '../../components/LoadingOptimizer';

export default function LoadingOptimizerPage() {
  return (
    <div className="space-y-4">
      <PageHead title="Loading Optimizer" sub="Enter the truck and carton sizes, press Optimize loading and watch how the cartons should be stacked" />
      <LoadingOptimizer />
    </div>
  );
}
