'use client';
import MarginFrame from './MarginFrame';
import CurrentData from './data/CurrentData';

/** The read-only data sets behind the Margin screens (prices, rules, volumes, budgets, targets). Nothing is loaded until a button is pressed. */
export default function Data() {
  return <MarginFrame active="margin-data" title="Data" subtitle="The prices, rules, volumes, budgets and targets SAP holds for the Margin screens (read-only)">{() => <CurrentData />}</MarginFrame>;
}
