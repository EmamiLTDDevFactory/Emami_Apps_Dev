'use client';
import MarginFrame from './MarginFrame';
import HistoryScreen from './history/HistoryScreen';

export default function History() {
  return <MarginFrame active="margin-history" title="History" subtitle="How the cost of one finished good moved over the stored snapshots: COGM Standard, Current and Actual, the current ratio and the erosion. SAP computes every figure.">{(c) => <HistoryScreen ctx={c} />}</MarginFrame>;
}
