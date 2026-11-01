'use client';
import MarginFrame from './MarginFrame';
import { Empty } from '../ui';

// Placeholder: replaced by the real screen.
export default function Upload() {
  return <MarginFrame active="margin-upload" title="Upload" subtitle="Margin module">{() => <Empty title="Coming">This screen is being built.</Empty>}</MarginFrame>;
}
