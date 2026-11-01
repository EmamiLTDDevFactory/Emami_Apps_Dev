'use client';
import MarginFrame from './MarginFrame';
import PortfolioScreen from './portfolio/PortfolioScreen';

export default function Portfolio() {
  return <MarginFrame active="margin-portfolio" title="Portfolio" subtitle="Groups of finished goods: alerts, data gaps, weighted ratios (% of selling price), revenue and annual impact. SAP computes every figure.">{(c) => <PortfolioScreen ctx={c} />}</MarginFrame>;
}
