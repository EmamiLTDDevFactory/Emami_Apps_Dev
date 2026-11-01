'use client';
import MarginFrame from './MarginFrame';
import { Empty } from '../ui';

// Placeholder: replaced by the real screen.
export default function Portfolio() {
  return <MarginFrame active="margin-portfolio" title="Portfolio" subtitle="Margin module">{() => <Empty title="Coming">This screen is being built.</Empty>}</MarginFrame>;
}
