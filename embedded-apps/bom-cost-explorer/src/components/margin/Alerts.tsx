'use client';
import MarginFrame from './MarginFrame';
import { Empty } from '../ui';

// Placeholder: replaced by the real screen.
export default function Alerts() {
  return <MarginFrame active="margin-alerts" title="Alerts" subtitle="Margin module">{() => <Empty title="Coming">This screen is being built.</Empty>}</MarginFrame>;
}
