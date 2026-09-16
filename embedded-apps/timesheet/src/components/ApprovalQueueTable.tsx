import StatusBadge from './StatusBadge';
import { formatDateTime } from '../utils/date';

interface QueueRow {
  key: string;
  user: { id: string; name: string; email: string };
  displayStatus: string;
  submittedDate: string | null;
  monthTotal: number;
  canBulkApprove: boolean;
}

export default function ApprovalQueueTable({
  rows,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onOpenRow,
  onBulkApprove,
}: {
  rows: QueueRow[];
  selectedIds: string[];
  onToggleSelect: (key: string) => void;
  onToggleSelectAll: (keys: string[]) => void;
  onOpenRow: (row: QueueRow) => void;
  onBulkApprove: () => void;
}) {
  const selectableRows = rows.filter((r) => r.canBulkApprove);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.includes(r.key));

  return (
    <div className="card overflow-hidden">
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between border-b border-tealBg bg-tealBg px-4 py-2.5">
          <span className="text-sm font-medium text-teal">{selectedIds.length} selected</span>
          <button
            type="button"
            onClick={onBulkApprove}
            className="rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white shadow-xs transition-all hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-1"
          >
            Approve selected
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-tealBg bg-tealBg text-left text-ink">
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all straightforward submissions"
                  checked={allSelected}
                  disabled={selectableRows.length === 0}
                  onChange={() => onToggleSelectAll(selectableRows.map((r) => r.key))}
                  className="h-4 w-4 rounded border-border text-teal focus:ring-teal"
                />
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Team member
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Submitted
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Hours
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border transition-colors last:border-0 hover:bg-tealBg/40">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.user.name}'s timesheet`}
                    checked={selectedIds.includes(row.key)}
                    disabled={!row.canBulkApprove}
                    onChange={() => onToggleSelect(row.key)}
                    className="h-4 w-4 rounded border-border text-teal focus:ring-teal disabled:opacity-30"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{row.user.name}</div>
                  <div className="text-xs text-inkSoft">{row.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.displayStatus} />
                </td>
                <td className="px-4 py-3 text-inkSoft">{row.submittedDate ? formatDateTime(row.submittedDate) : '-'}</td>
                <td className="px-4 py-3 text-right font-medium text-ink">{row.monthTotal.toFixed(2).replace(/\.00$/, '')}h</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => onOpenRow(row)} className="font-medium text-teal hover:text-teal/80 focus:outline-none focus-visible:underline">
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-inkSoft">
                  No direct reports to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
