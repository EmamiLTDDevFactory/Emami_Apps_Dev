'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

export default function WacHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-line bg-panel shadow-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}<HelpCircle size={14} className="text-accent" aria-hidden /> How to read this page
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line px-4 py-3 text-sm text-muted lg:grid-cols-2">
          <section>
            <h3 className="mb-1 font-bold text-ink">The weighted average actual cost</h3>
            <p>For the period and plants you choose, SAP takes the goods-receipt documents of each finished good, adds up their cost (RM, PM, Perfume, conversion, landed) and divides by the quantity received. Reversals are netted. The result is INR per unit of the unit shown. SAP does the arithmetic; this page shows its figures. The only number computed here is the &quot;selection total&quot; row, a quantity-weighted mean, shown when every row has the same unit.</p>
            <h3 className="mb-1 mt-3 font-bold text-ink">The rate sources</h3>
            <ul className="list-disc pl-5">
              <li><b>Selected</b>: the rate chosen by the costing priority.</li>
              <li><b>C-MAP</b>: the current moving average price (from the material valuation).</li>
              <li><b>Consumption</b>: the consumption rate.</li>
              <li><b>Average</b>: the average component rate, from a separate dataset that may not be loaded yet; until then this column is simply absent.</li>
            </ul>
            <p className="mt-2"><b>Source costs use today&apos;s rates and the current BOM</b>, while the actual cost uses the documents of the period. A gap can therefore come from a price move or a BOM change as much as from the shop floor.</p>
          </section>
          <section>
            <h3 className="mb-1 font-bold text-ink">Reading the colours</h3>
            <p>The variance is the actual material cost compared with each source: <b>+4.2 %</b> means actual is above the source, <b>−1.0 %</b> below. The colour is SAP&apos;s flag, and every flag also carries an icon and a word:</p>
            <ul className="list-disc pl-5">
              <li><span className="font-bold text-bad">Red (High)</span>: at or above the red limit (SAP default 10 %, or the value you enter).</li>
              <li><span className="font-bold text-warn">Amber (Medium)</span>: at or above the amber limit (SAP default 5 %).</li>
              <li><span className="font-bold text-good">Green (OK)</span>: within the limits.</li>
              <li><span className="font-bold text-faint">Grey (n/a)</span>: SAP has no value for that source.</li>
            </ul>
            <h3 className="mb-1 mt-3 font-bold text-ink">Good to know</h3>
            <ul className="list-disc pl-5">
              <li>Without &quot;Compare with rate sources&quot; the page is fast (a database read). With it, SAP runs the live costing: about 10 to 15 seconds per 25 finished goods, and for 25 finished goods at most.</li>
              <li>Nothing loads until you press Run, and there is no time limit: use Stop to end a run. A result stays until you press Refresh.</li>
              <li>The warning triangle means some documents have several PO-cost rows; the scale icon means landed cost does not reconcile with material plus conversion.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
