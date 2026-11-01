'use client';
import MarginFrame from './MarginFrame';
import { Empty } from '../ui';

// Placeholder: replaced by the real screen.
export default function History() {
  return <MarginFrame active="margin-history" title="History" subtitle="Margin module">{() => <Empty title="Coming">This screen is being built.</Empty>}</MarginFrame>;
}
