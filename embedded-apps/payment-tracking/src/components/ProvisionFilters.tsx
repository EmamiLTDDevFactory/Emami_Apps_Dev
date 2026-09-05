import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../theme/tokens';
import type { PaymentTrackingRow } from '../lib/paymentTrackingApi';

type DimensionKey = 'status' | 'costCenter' | 'vendor' | 'glAccount' | 'poCreator' | 'country';

export interface ProvisionFilterState {
  search: string;
  status: string[];
  costCenter: string[];
  vendor: string[];
  glAccount: string[];
  poCreator: string[];
  /** Land1 — client-side only, never sent to SAP (see paymentTrackingApi.ts's header comment on
   * why: the ABAP doesn't honor a Land1 $filter yet, unlike the other dimensions here). */
  country: string[];
}

export const EMPTY_PROVISION_FILTERS: ProvisionFilterState = {
  search: '',
  status: [],
  costCenter: [],
  vendor: [],
  glAccount: [],
  poCreator: [],
  country: [],
};

export function countActiveProvisionFilters(f: ProvisionFilterState): number {
  return (
    f.status.length +
    f.costCenter.length +
    f.vendor.length +
    f.glAccount.length +
    f.poCreator.length +
    f.country.length +
    (f.search.trim() ? 1 : 0)
  );
}

/** Applied everywhere Dashboard/Provision Details feed rows into their KPIs, charts, and tile
 * groupings — a filtered-out row disappears from every one of those consistently, since they all
 * read from the same filtered array rather than filtering independently. */
export function applyProvisionFilters(rows: PaymentTrackingRow[], f: ProvisionFilterState): PaymentTrackingRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status.length && !f.status.includes(r.status)) return false;
    if (f.costCenter.length && !f.costCenter.includes(r.costCenter)) return false;
    if (f.vendor.length && !f.vendor.includes(r.vendor)) return false;
    if (f.glAccount.length && !f.glAccount.includes(r.glAccount)) return false;
    if (f.poCreator.length && !f.poCreator.includes(r.poCreator)) return false;
    if (f.country.length && !f.country.includes(r.country)) return false;
    if (q) {
      const haystack = `${r.poNumber} ${r.vendor} ${r.vendorName} ${r.serviceText} ${r.costCenter} ${r.costCenterText} ${r.country}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

interface Option {
  value: string;
  label: string;
  count: number;
}

function optionsFor(rows: PaymentTrackingRow[], keyOf: (r: PaymentTrackingRow) => string, labelOf: (r: PaymentTrackingRow) => string): Option[] {
  const byKey = new Map<string, Option>();
  for (const r of rows) {
    const value = keyOf(r);
    if (!value) continue;
    const cur = byKey.get(value) ?? { value, label: labelOf(r) || value, count: 0 };
    cur.count += 1;
    byKey.set(value, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

// The standard KPI dimensions this data supports — same fields the Dashboard breaks pending value
// down by and Provision Details groups tiles by, so "filter by a standard KPI" means exactly these.
const FILTER_DIMENSIONS: { key: DimensionKey; title: string; keyOf: (r: PaymentTrackingRow) => string; labelOf: (r: PaymentTrackingRow) => string }[] = [
  { key: 'status', title: 'Status', keyOf: (r) => r.status, labelOf: (r) => r.statusText || r.status },
  { key: 'costCenter', title: 'Cost Center', keyOf: (r) => r.costCenter, labelOf: (r) => [r.costCenter, r.costCenterText].filter(Boolean).join(' · ') },
  { key: 'vendor', title: 'Vendor', keyOf: (r) => r.vendor, labelOf: (r) => [r.vendor, r.vendorName].filter(Boolean).join(' · ') },
  { key: 'glAccount', title: 'GL Code', keyOf: (r) => r.glAccount, labelOf: (r) => [r.glAccount, r.glAccountText].filter(Boolean).join(' · ') },
  { key: 'poCreator', title: 'PO Creator', keyOf: (r) => r.poCreator, labelOf: (r) => r.poCreator },
  { key: 'country', title: 'Country', keyOf: (r) => r.country, labelOf: (r) => r.country },
];

function FilterSection({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim() ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())) : options;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {selected.length > 0 ? <Text style={styles.sectionCount}>{selected.length} selected</Text> : null}
      </View>

      {options.length === 0 ? (
        <Text style={styles.noOptions}>No values in the current data.</Text>
      ) : (
        <>
          {options.length > 8 ? (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={`Search ${title.toLowerCase()}…`}
              placeholderTextColor={colors.inkSoft}
              style={styles.sectionSearch}
            />
          ) : null}
          <View style={styles.chipWrap}>
            {filtered.map((o) => {
              const active = selected.includes(o.value);
              return (
                <Pressable
                  key={o.value}
                  onPress={() => onToggle(o.value)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {o.label} ({o.count})
                  </Text>
                </Pressable>
              );
            })}
            {filtered.length === 0 ? <Text style={styles.noOptions}>No matches for "{query}".</Text> : null}
          </View>
        </>
      )}
    </View>
  );
}

interface ProvisionFilterBarProps {
  /** Unfiltered rows — option lists and their counts are computed from this, not from the already
   * filtered result, so a value doesn't disappear from the picker just because selecting it (or
   * another filter) narrowed the list to zero rows containing it. */
  rows: PaymentTrackingRow[];
  value: ProvisionFilterState;
  onChange: (next: ProvisionFilterState) => void;
  /** Row count after filtering, for the "Showing X of Y" line. */
  resultCount: number;
}

/** Filter bar shared by Dashboard and Provision Details ("the report") — free-text search plus a
 * "Filters" sheet covering every standard KPI dimension (Status, Cost Center, Vendor, GL Code, PO
 * Creator) as multi-select chips. Active filters also render as a removable chip row right under
 * the bar so what's narrowing the view is always visible, not hidden inside a closed sheet. */
export function ProvisionFilterBar({ rows, value, onChange, resultCount }: ProvisionFilterBarProps) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveProvisionFilters(value);

  const dimensionOptions = useMemo(
    () => FILTER_DIMENSIONS.map((d) => ({ ...d, options: optionsFor(rows, d.keyOf, d.labelOf) })),
    [rows]
  );

  const toggle = (dimKey: DimensionKey, optValue: string) => {
    const current = value[dimKey];
    const next = current.includes(optValue) ? current.filter((v) => v !== optValue) : [...current, optValue];
    onChange({ ...value, [dimKey]: next });
  };

  const removeChip = (dimKey: DimensionKey, optValue: string) => {
    onChange({ ...value, [dimKey]: value[dimKey].filter((v) => v !== optValue) });
  };

  const clearAllDimensions = () => {
    onChange({ ...value, status: [], costCenter: [], vendor: [], glAccount: [], poCreator: [], country: [] });
  };

  const activeChips: { dimKey: DimensionKey; value: string; label: string }[] = [];
  for (const dim of dimensionOptions) {
    for (const selectedValue of value[dim.key]) {
      const opt = dim.options.find((o) => o.value === selectedValue);
      activeChips.push({ dimKey: dim.key, value: selectedValue, label: opt ? opt.label : selectedValue });
    }
  }

  return (
    <View style={styles.bar}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={15} color={colors.inkSoft} />
          <TextInput
            value={value.search}
            onChangeText={(text) => onChange({ ...value, search: text })}
            placeholder="Search PO number, vendor, service text, cost center…"
            placeholderTextColor={colors.inkSoft}
            style={styles.searchInput}
          />
          {value.search ? (
            <Pressable onPress={() => onChange({ ...value, search: '' })} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.inkSoft} />
            </Pressable>
          ) : null}
        </View>

        <Pressable style={styles.filtersBtn} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open filters">
          <Ionicons name="options-outline" size={15} color={colors.rust} />
          <Text style={styles.filtersBtnText}>Filters</Text>
          {activeCount > 0 ? (
            <View style={styles.filtersBadge}>
              <Text style={styles.filtersBadgeText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Text style={styles.resultText}>
        Showing {resultCount} of {rows.length} line item{rows.length === 1 ? '' : 's'}
        {activeCount > 0 ? ` · ${activeCount} filter${activeCount === 1 ? '' : 's'} applied` : ''}
      </Text>

      {activeChips.length > 0 ? (
        <View style={styles.activeChipRow}>
          {activeChips.map((c) => (
            <Pressable
              key={`${c.dimKey}-${c.value}`}
              style={styles.activeChip}
              onPress={() => removeChip(c.dimKey, c.value)}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${c.label}`}
            >
              <Text style={styles.activeChipText}>{c.label}</Text>
              <Ionicons name="close" size={12} color={colors.rust} />
            </Pressable>
          ))}
          <Pressable onPress={clearAllDimensions} accessibilityRole="button" accessibilityLabel="Clear all filters">
            <Text style={styles.clearAllInlineText}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close filters" />
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.flex1}>
                <Text style={styles.modalTitle}>Filters</Text>
                <Text style={styles.modalSubtitle}>Narrow this view by any combination of the standard provision KPIs below.</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={20} color={colors.ink} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {dimensionOptions.map((dim) => (
                <FilterSection
                  key={dim.key}
                  title={dim.title}
                  options={dim.options}
                  selected={value[dim.key]}
                  onToggle={(v) => toggle(dim.key, v)}
                />
              ))}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <Pressable onPress={clearAllDimensions} accessibilityRole="button" accessibilityLabel="Clear all filters">
                <Text style={styles.clearAllText}>Clear all</Text>
              </Pressable>
              <Pressable style={styles.doneBtn} onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Done">
                <Text style={styles.doneBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  bar: {
    gap: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: colors.ink,
  },
  filtersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filtersBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.rust,
  },
  filtersBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.rust,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtersBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.white,
  },
  resultText: {
    fontSize: 12,
    color: colors.inkSoft,
  },
  activeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: `${colors.rust}14`,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  activeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.rust,
  },
  clearAllInlineText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(31,27,51,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: 20,
    gap: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: colors.inkSoft,
    marginTop: 3,
    lineHeight: 18,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  clearAllText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
  doneBtn: {
    borderRadius: radii.pill,
    backgroundColor: colors.rust,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  doneBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.white,
  },
  section: {
    marginBottom: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.ink,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.rust,
  },
  sectionSearch: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.ink,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.appBg,
  },
  chipActive: {
    borderColor: colors.rust,
    backgroundColor: `${colors.rust}18`,
  },
  chipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.ink,
  },
  chipTextActive: {
    color: colors.rust,
    fontWeight: '800',
  },
  noOptions: {
    fontSize: 12,
    color: colors.inkSoft,
  },
});
