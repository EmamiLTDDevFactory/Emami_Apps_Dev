'use client';
import MarginFrame from './MarginFrame';
import { Empty } from '../ui';

// Placeholder: replaced by the real screen.
export default function WhatIf() {
  return <MarginFrame active="margin-whatif" title="WhatIf" subtitle="Margin module">{() => <Empty title="Coming">This screen is being built.</Empty>}</MarginFrame>;
}
