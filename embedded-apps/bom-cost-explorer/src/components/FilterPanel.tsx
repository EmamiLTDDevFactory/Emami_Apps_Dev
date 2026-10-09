'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Coins, Factory, Gauge, Package, Play, RefreshCw, SlidersHorizontal, Square, Truck, Wallet, type LucideIcon } from 'lucide-react';
import type { PlantRow } from '@/lib/sap/fields';
import { costQuerySchema, MAX_MATERIALS, MODE_LABEL, RATE_SOURCES, usesField, type CostQuery, type QueryField } from '@/lib/query/schema';
import { MaterialHierarchyPicker, MaterialPicker, PlantPicker, PriorityList } from './Pickers';
import { MODE_ICON } from './Shell';
import { Button, cx, Field, inputBase, inputCls, Segmented } from './ui';

export function validate(q: CostQuery): Record<string, string> {
  const r = costQuerySchema.safeParse(q);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[String(i.path[0] ?? '_')] ??= i.message;
  return out;
}

export interface PlantsState {
  plants: PlantRow[];
  loading: boolean;
  error: string;
  reload: () => void;
}

function Block({ icon: Icon, title, children, className }: { icon: LucideIcon; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-line bg-gradient-to-b from-sunken/70 to-panel p-3.5', className)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-panel text-accent shadow-card ring-1 ring-line"><Icon size={14} /></span>
        <h3 className="text-[13px] font-extrabold tracking-tight text-ink">{title}</h3>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

/** Number input with quick-pick chips. */
function QuickNumber({ id, value, onChange, picks, suffix, decimal }: { id: string; value: string; onChange: (v: string) => void; picks: (number | string)[]; suffix?: string; decimal?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input id={id} className={cx(inputCls, suffix && 'pr-12')} inputMode={decimal ? 'decimal' : 'numeric'} value={value} onChange={(e) => onChange(e.target.value.replace(',', '.'))} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-faint">{suffix}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {picks.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(String(p))}
            className={cx('rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition', String(p) === value ? 'border-accent bg-accent text-white' : 'border-line bg-panel text-muted hover:border-accent/50 hover:text-accent')}
          >
            {Number(p).toLocaleString('en-IN')}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-line bg-panel px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">{children}</span>;
}

/** The selection, as a collapsible card above the results: blocks per topic, segmented toggles,
 * quick-pick chips. Collapsed, it shows a one-line summary so the results get the screen. */
export default function FilterPanel({
  query, onChange, plants, running, onRun, onCancel, collapsed, onToggle,
}: {
  query: CostQuery; onChange: (q: CostQuery) => void; plants: PlantsState; running: boolean; onRun: () => void; onCancel: () => void;
  collapsed: boolean; onToggle: () => void;
}) {
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => validate(query), [query]);
  const show = (k: string) => (touched ? errors[k] : undefined);
  const u = (f: QueryField) => usesField(query.mode, f);
  const set = <K extends keyof CostQuery>(k: K, v: CostQuery[K]) => onChange({ ...query, [k]: v });
  const int = (v: string, d: number) => (v === '' ? d : Math.max(0, Math.trunc(Number(v)) || 0));
  const valid = Object.keys(errors).length === 0;
  const ModeIcon = MODE_ICON[query.mode];
  const plantList = query.mode === 'C' ? [query.bomPlant, ...query.compPlants].filter(Boolean) : query.plants;

  const submit = () => {
    setTouched(true);
    if (valid && !running) onRun();
  };

  const summary = (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Chip><Package size={12} className="text-accent" />{query.materials.length ? `${query.materials.slice(0, 3).join(', ')}${query.materials.length > 3 ? ` +${query.materials.length - 3}` : ''}` : 'no materials'}</Chip>
      <Chip><Factory size={12} className="text-accent" />{query.mode === 'C' ? `${query.bomPlant || '?'} → ${query.compPlants.join(', ') || '?'}` : plantList.join(', ') || 'no plants'}</Chip>
      {u('explQty') && <Chip>Qty {query.explQty}</Chip>}
      {u('lookback') && <Chip>{query.lookback} days</Chip>}
      {u('inclFrt') && <Chip>{query.inclFrt ? (query.stdFrt ? 'Std freight' : 'Actual freight') : 'No freight'}</Chip>}
      {u('inclBudget') && query.inclBudget && <Chip>Budget {query.budgetYr}</Chip>}
    </div>
  );

  return (
    <section className="rounded-2xl border border-line bg-panel shadow-card no-print" aria-label="Selection">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <header className={cx('flex flex-wrap items-center gap-3 px-4 py-3', !collapsed && 'border-b border-line')}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-deep text-white shadow-sm"><ModeIcon size={19} /></span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-faint">Selection</p>
            <h2 className="text-[15px] font-extrabold leading-tight text-ink">{MODE_LABEL[query.mode]}</h2>
          </div>
          {collapsed && <div className="min-w-0 flex-1">{summary}</div>}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onToggle} aria-expanded={!collapsed}>
              {collapsed ? <><SlidersHorizontal size={15} /> Edit selection <ChevronDown size={14} /></> : <>Hide <ChevronUp size={14} /></>}
            </Button>
            {running ? (
              <Button type="button" variant="danger" onClick={onCancel}><Square size={14} /> Cancel run</Button>
            ) : (
              <Button type="submit" variant="primary" className="px-5"><Play size={14} /> Run in SAP</Button>
            )}
          </div>
        </header>

        {!collapsed && (
          <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-12">
            <Block icon={Package} title="What to cost" className="lg:col-span-5">
              <Field label={`Materials · ${query.materials.length}/${MAX_MATERIALS}`} error={show('materials')} hint="Type to search SAP, or paste a list (comma, space or new line)">
                {(id) => <MaterialPicker id={id} values={query.materials} onChange={(v) => set('materials', v)} max={MAX_MATERIALS} invalid={!!show('materials')} />}
              </Field>
              <MaterialHierarchyPicker values={query.materials} onChange={(v) => set('materials', v)} max={MAX_MATERIALS} />
              {u('plants') && (
                <Field label="Plants" error={show('plants')} hint={plants.loading ? 'Loading plants from SAP…' : `${plants.plants.length} plants from SAP`}>
                  {(id) => <PlantPicker id={id} values={query.plants} onChange={(v) => set('plants', v)} state={plants} invalid={!!show('plants')} />}
                </Field>
              )}
              {u('bomPlant') && (
                <Field label="BOM plant (one)" error={show('bomPlant')} hint="The BOM is exploded from this plant">
                  {(id) => <PlantPicker id={id} single values={query.bomPlant ? [query.bomPlant] : []} onChange={(v) => set('bomPlant', v[0] ?? '')} state={plants} invalid={!!show('bomPlant')} />}
                </Field>
              )}
              {u('compPlants') && (
                <Field label="Compare in plants" error={show('compPlants')} hint="Each plant is costed with its own rates, compared in INR">
                  {(id) => <PlantPicker id={id} values={query.compPlants} onChange={(v) => set('compPlants', v)} state={plants} invalid={!!show('compPlants')} />}
                </Field>
              )}
            </Block>

            {(u('explQty') || u('maxLevel') || u('capid')) && (
              <Block icon={Gauge} title="Quantity & structure" className="lg:col-span-3">
                {u('explQty') && (
                  <Field label="Explosion quantity" error={show('explQty')}>
                    {(id) => <QuickNumber id={id} decimal value={query.explQty} onChange={(v) => set('explQty', v)} picks={[1, 100, 1000, 10000]} suffix="PC" />}
                  </Field>
                )}
                {u('maxLevel') && (
                  <Field label="BOM levels">
                    {() => (
                      <Segmented
                        label="BOM levels"
                        size="sm"
                        value={[0, 1, 2, 3, 5].includes(query.maxLevel) ? query.maxLevel : 0}
                        onChange={(v) => set('maxLevel', v)}
                        options={[{ value: 0, label: 'All' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }, { value: 5, label: '5' }]}
                      />
                    )}
                  </Field>
                )}
                {u('capid') && (
                  <Field label="BOM application" hint="Leave empty for the default">
                    {(id) => <input id={id} className={inputCls} maxLength={4} placeholder="default" value={query.capid} onChange={(e) => set('capid', e.target.value.toUpperCase())} />}
                  </Field>
                )}
              </Block>
            )}

            {(u('lookback') || u('prio') || u('donorPlant')) && (
              <Block icon={Coins} title="Rates" className="lg:col-span-4">
                {u('lookback') && (
                  <Field label="Rate look-back" error={show('lookback')}>
                    {(id) => <QuickNumber id={id} value={String(query.lookback)} onChange={(v) => set('lookback', int(v, 365))} picks={[90, 180, 365, 730]} suffix="days" />}
                  </Field>
                )}
                {u('donorPlant') && (
                  <Field label="Donor plant" hint="Rates are taken from here when a plant has none">
                    {(id) => (
                      <select id={id} className={inputCls} value={query.donorPlant} onChange={(e) => set('donorPlant', e.target.value)}>
                        <option value="">No donor plant</option>
                        {plants.plants.map((p) => <option key={p.Werks} value={p.Werks}>{p.Werks} · {p.Name1}</option>)}
                      </select>
                    )}
                  </Field>
                )}
                {u('prio') && (
                  <Field label="Rate source priority" error={show('prio')} hint="Drag to reorder, or Alt + ↑/↓">
                    {() => <PriorityList value={query.prio} onChange={(v) => set('prio', v as CostQuery['prio'])} all={RATE_SOURCES} />}
                  </Field>
                )}
              </Block>
            )}

            {(u('inclFrt') || u('stdFrt') || u('freightDays') || u('latestOnly')) && (
              <Block icon={Truck} title="Freight" className="lg:col-span-4">
                {u('inclFrt') && (
                  <Segmented label="Freight" value={query.inclFrt} onChange={(v) => set('inclFrt', v)} options={[{ value: true, label: 'Include freight' }, { value: false, label: 'Exclude' }]} />
                )}
                {u('stdFrt') && (
                  <Segmented label="Freight basis" value={query.stdFrt} onChange={(v) => set('stdFrt', v)} options={[{ value: false, label: 'Actual' }, { value: true, label: 'Standard' }]} />
                )}
                {u('latestOnly') && (
                  <Segmented label="Purchase orders" value={query.latestOnly} onChange={(v) => set('latestOnly', v)} options={[{ value: true, label: 'Latest PO only' }, { value: false, label: 'All POs' }]} />
                )}
                {u('freightDays') && (
                  <Field label="Freight look-back" error={show('freightDays')}>
                    {(id) => <QuickNumber id={id} value={String(query.freightDays)} onChange={(v) => set('freightDays', int(v, 180))} picks={[90, 180, 365]} suffix="days" />}
                  </Field>
                )}
              </Block>
            )}

            {(u('inclBudget') || u('inclCover')) && (
              <Block icon={Wallet} title="Budget & coverage" className="lg:col-span-4">
                <Segmented label="Budget" value={query.inclBudget} onChange={(v) => set('inclBudget', v)} options={[{ value: false, label: 'No budget' }, { value: true, label: 'Compare to budget' }]} />
                {query.inclBudget && (
                  <Field label="Budget year" error={show('budgetYr')}>
                    {(id) => <input id={id} type="number" className={inputCls} value={query.budgetYr ?? ''} onChange={(e) => set('budgetYr', e.target.value ? Number(e.target.value) : undefined)} />}
                  </Field>
                )}
                <Segmented label="Coverage" value={query.inclCover} onChange={(v) => set('inclCover', v)} options={[{ value: false, label: 'No coverage' }, { value: true, label: 'Stock coverage' }]} />
                {query.inclCover && (
                  <div className="grid grid-cols-3 gap-2">
                    {(['hor1', 'hor2', 'hor3'] as const).map((h, i) => (
                      <Field key={h} label={`H${i + 1} days`} error={i === 0 ? show('hor1') : undefined}>
                        {(id) => <input id={id} type="number" min={1} className={inputCls} value={query[h]} onChange={(e) => set(h, int(e.target.value, 30))} />}
                      </Field>
                    ))}
                  </div>
                )}
              </Block>
            )}

            {(u('budatWindow') || u('asof')) && (
              <Block icon={CalendarClock} title="Dates" className="lg:col-span-4">
                {u('asof') && (
                  <>
                    <Segmented label="Costing date" value={query.useAsof} onChange={(v) => set('useAsof', v)} options={[{ value: false, label: 'Today' }, { value: true, label: 'As of a date' }]} />
                    {query.useAsof && (
                      <Field label="As-of date" error={show('asofDate')}>
                        {(id) => <input id={id} type="date" className={inputCls} value={query.asofDate ?? ''} onChange={(e) => set('asofDate', e.target.value)} />}
                      </Field>
                    )}
                  </>
                )}
                {u('budatWindow') && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Actual qty from" error={show('budatFrom')}>
                      {(id) => <input id={id} type="date" className={cx(inputBase, 'h-9 w-full')} value={query.budatFrom ?? ''} onChange={(e) => set('budatFrom', e.target.value)} />}
                    </Field>
                    <Field label="to">
                      {(id) => <input id={id} type="date" className={cx(inputBase, 'h-9 w-full')} value={query.budatTo ?? ''} onChange={(e) => set('budatTo', e.target.value)} />}
                    </Field>
                  </div>
                )}
              </Block>
            )}

            {(touched && !valid) || plants.error ? (
              <div className="flex flex-wrap items-center gap-3 lg:col-span-12">
                {touched && !valid && <p className="text-xs font-semibold text-bad" role="alert">Fix the highlighted fields first.</p>}
                {plants.error && (
                  <p className="flex items-center gap-2 text-xs font-semibold text-bad" role="alert">
                    Plants could not be loaded from SAP: {plants.error}
                    <Button size="sm" onClick={plants.reload}><RefreshCw size={12} /> Retry</Button>
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </form>
    </section>
  );
}
