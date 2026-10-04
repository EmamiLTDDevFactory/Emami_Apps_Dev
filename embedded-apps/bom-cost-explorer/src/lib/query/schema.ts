import { z } from 'zod';

export const MODES = ['B', 'C', 'R', 'F', 'M'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  B: 'BOM costing',
  C: 'Plant comparison',
  R: 'Rates',
  F: 'Freight',
  M: 'RM / PM',
};

export const RATE_SOURCES = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'] as const;
export type RateSource = (typeof RATE_SOURCES)[number];
export const DEFAULT_PRIO: RateSource[] = ['CONTRACT', 'INFOREC', 'MARKT', 'CONSUMP', 'MBEW'];

export const MAX_MATERIALS = 50;

/** Every parameter the selection screen knows. Which ones a mode uses is MODE_FIELDS. */
export type QueryField =
  | 'materials' | 'plants' | 'bomPlant' | 'compPlants' | 'explQty' | 'maxLevel' | 'lookback'
  | 'freightDays' | 'prio' | 'donorPlant' | 'inclFrt' | 'stdFrt' | 'latestOnly' | 'inclBudget'
  | 'budgetYr' | 'inclCover' | 'horizons' | 'budatWindow' | 'asof' | 'capid';

/** Same show/hide rules as the original SAP selection screen. */
export const MODE_FIELDS: Record<Mode, readonly QueryField[]> = {
  B: ['materials', 'plants', 'explQty', 'maxLevel', 'lookback', 'prio', 'donorPlant', 'inclFrt', 'stdFrt',
    'inclBudget', 'budgetYr', 'inclCover', 'horizons', 'budatWindow', 'asof', 'capid'],
  C: ['materials', 'bomPlant', 'compPlants', 'explQty', 'lookback', 'prio', 'donorPlant', 'inclFrt', 'stdFrt', 'asof', 'capid'],
  R: ['materials', 'plants', 'lookback'],
  F: ['materials', 'plants', 'freightDays', 'stdFrt', 'latestOnly'],
  M: ['materials', 'plants', 'explQty', 'lookback', 'freightDays', 'prio', 'donorPlant', 'stdFrt', 'capid'],
};

export const usesField = (mode: Mode, f: QueryField) => MODE_FIELDS[mode].includes(f);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const code = z.string().trim().min(1).max(40);

export const costQuerySchema = z
  .object({
    mode: z.enum(MODES),
    materials: z.array(code).min(1, 'Pick at least one material').max(MAX_MATERIALS, `SAP accepts at most ${MAX_MATERIALS} header materials per run`),
    plants: z.array(code).max(200).default([]),
    bomPlant: z.string().trim().max(4).default(''),
    compPlants: z.array(code).max(50).default([]),
    explQty: z.string().trim().regex(/^\d+(\.\d+)?$/, 'Quantity must be a positive number').default('1'),
    maxLevel: z.number().int().min(0).max(99).default(0),
    lookback: z.number().int().min(1).max(3650).default(365),
    freightDays: z.number().int().min(1).max(3650).default(180),
    prio: z.array(z.enum(RATE_SOURCES)).min(1).default(DEFAULT_PRIO),
    donorPlant: z.string().trim().max(4).default(''),
    inclFrt: z.boolean().default(true),
    stdFrt: z.boolean().default(false),
    latestOnly: z.boolean().default(true),
    inclBudget: z.boolean().default(false),
    budgetYr: z.number().int().min(2000).max(2100).optional(),
    inclCover: z.boolean().default(false),
    hor1: z.number().int().min(1).max(3650).default(30),
    hor2: z.number().int().min(1).max(3650).default(60),
    hor3: z.number().int().min(1).max(3650).default(90),
    budatFrom: isoDate.optional().or(z.literal('')),
    budatTo: isoDate.optional().or(z.literal('')),
    useAsof: z.boolean().default(false),
    asofDate: isoDate.optional().or(z.literal('')),
    capid: z.string().trim().max(4).default(''),
  })
  .superRefine((q, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (Number(q.explQty) <= 0 && usesField(q.mode, 'explQty')) issue('explQty', 'Quantity must be greater than 0');
    if (q.mode === 'C') {
      if (!q.bomPlant) issue('bomPlant', 'Pick exactly one BOM plant');
      if (q.compPlants.length === 0) issue('compPlants', 'Pick at least one comparison plant');
    } else if (q.plants.length === 0) {
      issue('plants', 'Pick at least one plant');
    }
    if (q.mode === 'B' && q.inclBudget && !q.budgetYr) issue('budgetYr', 'Budget year is required when budget is included');
    if (q.mode === 'B' && q.inclCover && !(q.hor1 < q.hor2 && q.hor2 < q.hor3)) issue('hor1', 'Horizons must increase: H1 < H2 < H3');
    if (q.mode === 'B' && q.budatFrom && q.budatTo && q.budatFrom > q.budatTo) issue('budatFrom', '"From" must be on or before "To"');
    if ((q.mode === 'B' || q.mode === 'C') && q.useAsof && !q.asofDate) issue('asofDate', 'Pick the as-of date');
    if (new Set(q.prio).size !== q.prio.length) issue('prio', 'Each rate source may appear once');
  });

export type CostQuery = z.infer<typeof costQuerySchema>;

export function defaultQuery(mode: Mode = 'B'): CostQuery {
  return {
      mode,
      materials: [],
      plants: [],
      bomPlant: '',
      compPlants: [],
      explQty: '1',
      maxLevel: 0,
      lookback: 365,
      freightDays: 180,
      prio: [...DEFAULT_PRIO],
      donorPlant: '',
      inclFrt: true,
      stdFrt: false,
      latestOnly: true,
      inclBudget: false,
      budgetYr: new Date().getFullYear(),
      inclCover: false,
      hor1: 30,
      hor2: 60,
      hor3: 90,
      budatFrom: '',
      budatTo: '',
      useAsof: false,
      asofDate: '',
      capid: '',
  };
}

/** Paging/sort/search for the R/F/M tables (served from the BFF's result cache). */
export const pageSchema = z.object({
  top: z.number().int().min(1).max(1000).default(100),
  skip: z.number().int().min(0).default(0),
  sort: z.string().max(40).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().max(100).default(''),
  filters: z.record(z.string().max(40), z.string().max(100)).default({}),
  all: z.boolean().default(false),
});
export type PageRequest = z.infer<typeof pageSchema>;

export const costRequestSchema = z.object({ query: costQuerySchema, page: pageSchema.optional() });

/** Every plant a query touches (for authorisation). */
export function plantsOf(q: CostQuery): string[] {
  const out = q.mode === 'C' ? [q.bomPlant, ...q.compPlants] : [...q.plants];
  if (q.donorPlant && usesField(q.mode, 'donorPlant')) out.push(q.donorPlant);
  return out.filter(Boolean);
}

/** Human-readable parameter list (Excel "Parameters" sheet, scenario cards). */
export function describeQuery(q: CostQuery): [string, string][] {
  const yes = (b: boolean) => (b ? 'Yes' : 'No');
  const rows: [string, string][] = [['Mode', `${q.mode} - ${MODE_LABEL[q.mode]}`], ['Materials', q.materials.join(', ')]];
  const u = (f: QueryField) => usesField(q.mode, f);
  if (u('plants')) rows.push(['Plants', q.plants.join(', ')]);
  if (u('bomPlant')) rows.push(['BOM plant', q.bomPlant]);
  if (u('compPlants')) rows.push(['Comparison plants', q.compPlants.join(', ')]);
  if (u('explQty')) rows.push(['Explosion quantity', q.explQty]);
  if (u('maxLevel')) rows.push(['Max BOM level', q.maxLevel ? String(q.maxLevel) : 'All']);
  if (u('lookback')) rows.push(['Rate look-back (days)', String(q.lookback)]);
  if (u('freightDays')) rows.push(['Freight look-back (days)', String(q.freightDays)]);
  if (u('prio')) rows.push(['Rate priority', q.prio.join(' > ')]);
  if (u('donorPlant')) rows.push(['Donor plant', q.donorPlant || '-']);
  if (u('inclFrt')) rows.push(['Include freight', yes(q.inclFrt)]);
  if (u('stdFrt')) rows.push(['Standard freight', yes(q.stdFrt)]);
  if (u('latestOnly')) rows.push(['Latest only', yes(q.latestOnly)]);
  if (u('inclBudget')) rows.push(['Include budget', q.inclBudget ? `Yes (${q.budgetYr})` : 'No']);
  if (u('inclCover')) rows.push(['Include coverage', q.inclCover ? `Yes (${q.hor1}/${q.hor2}/${q.hor3} days)` : 'No']);
  if (u('budatWindow') && (q.budatFrom || q.budatTo)) rows.push(['Actual-qty window', `${q.budatFrom || '…'} to ${q.budatTo || '…'}`]);
  if (u('asof') && q.useAsof) rows.push(['As-of date', q.asofDate || '']);
  if (u('capid') && q.capid) rows.push(['BOM application', q.capid]);
  return rows;
}
