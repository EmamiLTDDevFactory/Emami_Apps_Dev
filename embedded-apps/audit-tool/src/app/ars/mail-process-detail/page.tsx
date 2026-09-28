'use client';

// MailProcessDetail.controller.js + view — route "MailProcessDetail/{SubLglEntL1},{SubLglEntL2},
// {Process},{SubProcess}"; the four segments arrive here as query-string values (useNavTo).
import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye } from 'lucide-react';
import { Page, DataTable } from '../../../components/ui';
import { useUi } from '../../../context/UiContext';
import { And, F, read } from '../../../lib/odata';
import { Clock, ClosedActionDialog, ObservationDisplayDialog } from '../../../components/closed/Dialogs';
import { fetchAttachmentsMail, fetchAuditManagers, type Row } from '../../../components/closed/shared';

function MailProcessDetail() {
  const params = useSearchParams();
  const ui = useUi();
  const SubLglEntL1 = params.get('SubLglEntL1') ?? '';
  const SubLglEntL2 = params.get('SubLglEntL2') ?? '';
  const Process = params.get('Process') ?? '';
  const SubProcess = params.get('SubProcess') ?? '';

  const [rows, setRows] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row | null>(null);
  const [attachments, setAttachments] = useState<Row[]>([]);
  const [actionOpen, setActionOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  useEffect(() => {
    read<Row>('/ZMSD_STR_MANAGE_PROCESS_MAILSet', {
      filters: [
        And([
          F('SubLglEntL1', 'EQ', SubLglEntL1),
          F('SubLglEntL2', 'EQ', SubLglEntL2),
          F('Process', 'EQ', Process),
          F('SubProcess', 'EQ', SubProcess),
        ]),
      ],
    })
      .then(({ results }) => setRows(results))
      .catch(() => ui.messageBox.error('Internal Server error'));

    // Fills auditJsonModel>/Closed2/User in the source; nothing visible binds to it.
    fetchAuditManagers().catch(() => ui.messageBox.error('Internal Server error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SubLglEntL1, SubLglEntL2, Process, SubProcess]);

  const handleLineItemPress = (row: Row) => {
    setAudit({ ...row });
    setAttachments([]);
    fetchAttachmentsMail(row)
      .then(setAttachments)
      .catch(() => ui.messageBox.error('Internal Server error'));
    setActionOpen(true);
  };

  return (
    <Page title="Process Details" actions={<Clock />}>
      <DataTable
        rows={rows}
        growingThreshold={10}
        maxHeight="65vh"
        columns={[
          { key: 'Process', header: 'Process' },
          { key: 'SubProcess', header: 'Sub Process' },
          { key: 'AuditSteps', header: 'Audit Steps', className: 'whitespace-pre-wrap' },
          {
            key: 'action',
            header: 'Action',
            render: (r) => (
              <button type="button" aria-label="View" className="p-1 text-rust hover:text-rustDeep" onClick={() => handleLineItemPress(r)}>
                <Eye size={16} />
              </button>
            ),
          },
        ]}
      />
      {/* This screen never loads observation items or sets a status (the source dialog shows
          whatever an earlier screen left in auditJsonModel), so both start empty here. */}
      <ClosedActionDialog
        open={actionOpen}
        audit={audit}
        status=""
        observationItems={[]}
        attachments={attachments}
        onDisplayObservation={setDetail}
        onClose={() => setActionOpen(false)}
      />
      <ObservationDisplayDialog open={detail !== null} detail={detail} personOwnerRows={[]} onClose={() => setDetail(null)} />
    </Page>
  );
}

export default function MailProcessDetailPage() {
  return (
    <Suspense fallback={null}>
      <MailProcessDetail />
    </Suspense>
  );
}
