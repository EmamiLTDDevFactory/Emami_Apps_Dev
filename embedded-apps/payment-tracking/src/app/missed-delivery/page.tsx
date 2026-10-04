'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarX2 } from 'lucide-react';
import { fetchProvisionPOs, type PaymentTrackingRow } from '../../lib/paymentTrackingApi';
import PaymentTrackingTable from '../../components/PaymentTrackingTable';
import { usePaymentTrackingAuth } from '../../context/PaymentTrackingAuthContext';
import { useMonthYear } from '../../context/MonthYearContext';
import { filterByMonth } from '../../lib/provisionMetrics';
import { Banner, Card, LoadingBlock, PageHeader } from '../../components/ui';

/** Missed Provision — non-Admin's second side-pane option. Scoped by the signed-in user's own
 * login email, same as Upcoming Provision (see index.tsx's header comment for why, and for the
 * status split this is provisional on).
 *
 * PROVISIONAL SPLIT, needs confirmation. Shows status '02' — "GR/MIGO posted, Service Entry Sheet
 * not created", called out explicitly as the main provision exposure bucket. Flag if this split
 * is wrong. */
export default function PaymentTrackingMissedDelivery() {
  const { email } = usePaymentTrackingAuth();
  const { month, year } = useMonthYear();
  const [rows, setRows] = useState<PaymentTrackingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!email) {
      setLoading(false);
      setError('Not signed in.');
      return;
    }
    setLoading(true);
    setError(null);
    fetchProvisionPOs(email, { status: '02', gjahr: year })
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load missed provision items.'))
      .finally(() => setLoading(false));
  }, [email, year]);

  const displayRows = useMemo(() => filterByMonth(rows, month), [rows, month]);

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        eyebrow="Provision Tracking"
        title="Missed Provision"
        subtitle="GR/MIGO posted but no Service Entry Sheet created yet — your main provision exposure bucket."
        icon={CalendarX2}
      />

      {loading ? (
        <Card ledger><LoadingBlock label="Loading missed provision items…" /></Card>
      ) : error ? (
        <Banner type="error">{error}</Banner>
      ) : (
        <PaymentTrackingTable rows={displayRows} emptyMessage="No missed provision items." />
      )}
    </div>
  );
}
