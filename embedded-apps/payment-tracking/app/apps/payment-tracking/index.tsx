import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../../../src/theme/tokens';
import { getHubEmail } from '../../../src/lib/hubEmailLogin';
import { fetchUpcomingDeliveryPOs, type UpcomingPoRow } from '../../../src/lib/paymentTrackingApi';
import UpcomingPoTable, { type Revision } from '../../../src/components/UpcomingPoTable';
import PeriodFilter, { type Period } from '../../../src/components/PeriodFilter';
import { useUnsavedChanges } from '../../../src/context/UnsavedChangesContext';

/** Upcoming Delivery PO — Option A in the side pane. Loads Zaction 'A', filtered server-side by
 * the 7/15-day period (sent to SAP as `Interval eq 7`/`Interval eq 15` — see
 * paymentTrackingApi.ts's fetchUpcomingDeliveryPOs), with the "Delivery Confirmed?" toggle per row and
 * a Final Submission action gated on at least one row having been answered. */
export default function PaymentTrackingUpcoming() {
  const [email] = useState(() => getHubEmail());
  const [period, setPeriod] = useState<Period>(7);

  const [rows, setRows] = useState<UpcomingPoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revisions, setRevisions] = useState<Record<string, Revision>>({});
  const [submitted, setSubmitted] = useState(false);
  const { setHasUnsavedChanges } = useUnsavedChanges();

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchUpcomingDeliveryPOs(email, period)
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load upcoming delivery POs.'))
      .finally(() => setLoading(false));
  }, [email, period]);

  const hasAnyAnswered = useMemo(
    () => Object.values(revisions).some((r) => r.answer !== 'neutral'),
    [revisions]
  );

  // Reset the submit lock and the leave-page guard whenever the underlying answers change again
  // after a submission (e.g. the period filter reveals a different row set).
  useEffect(() => {
    setHasUnsavedChanges(hasAnyAnswered && !submitted);
  }, [hasAnyAnswered, submitted, setHasUnsavedChanges]);

  useEffect(() => {
    // Leaving this screen entirely (side-pane nav away) — clear the flag so it doesn't leak into
    // another section; re-entering resets `submitted`/`revisions` naturally via component remount.
    return () => setHasUnsavedChanges(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = () => {
    // No submit endpoint has been specified for these confirmations yet (same as the rest of this
    // app's edits — see UpcomingPoTable's own note) — this only locks the answers in locally so the
    // leave-page warning clears and the toggles stop being editable.
    setSubmitted(true);
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.panel}>
        <View style={styles.topRow}>
          <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setSubmitted(false); }} label="Delivery in next" />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.rust} />
            <Text style={styles.loadingText}>Loading upcoming delivery POs…</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <>
            <UpcomingPoTable
              rows={rows}
              emptyMessage={`No upcoming delivery POs in the next ${period} days.`}
              revisions={revisions}
              onRevisionsChange={(next) => { setRevisions(next); setSubmitted(false); }}
              locked={submitted}
            />

            {rows.length > 0 && (
              <View style={styles.submitRow}>
                {submitted && (
                  <View style={styles.submittedBadge}>
                    <Ionicons name="checkmark-circle" size={15} color={colors.green} />
                    <Text style={styles.submittedText}>Submitted</Text>
                  </View>
                )}
                <Pressable
                  onPress={onSubmit}
                  disabled={!hasAnyAnswered || submitted}
                  style={[styles.submitBtn, (!hasAnyAnswered || submitted) && styles.submitBtnDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel="Final Submission"
                >
                  <Ionicons name="paper-plane-outline" size={15} color={colors.white} />
                  <Text style={styles.submitBtnText}>Final Submission</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  panel: {
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  errorText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.red,
  },
  submitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  submittedText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.green,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.rust,
  },
  submitBtnDisabled: {
    backgroundColor: colors.border,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
});
