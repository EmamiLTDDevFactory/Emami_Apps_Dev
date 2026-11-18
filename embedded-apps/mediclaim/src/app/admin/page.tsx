'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import AdminGuard from '../../components/AdminGuard';
import Banner, { type BannerState } from '../../components/Banner';
import PolicyView from '../../components/PolicyView';
import { ConfirmDialog, Field, Section, Spinner, TableWrap, inputCls, selectCls, td, tdNum, th } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import { deletePolicy, getPolicy, searchPolicies } from '../../lib/mediclaim';
import type { Policy } from '../../lib/types';

const PAGE = 50;

function Policies() {
  const { ctx, isHrAdmin } = useApp();
  const [empId, setEmpId] = useState('');
  const [year, setYear] = useState(ctx?.Year ?? '');
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [detail, setDetail] = useState<Policy | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Years offered: the active period and the seven before it (ZMEDI_PERIOD has one row per year).
  const years = useMemo(() => {
    const y = Number(ctx?.Year);
    return y ? Array.from({ length: 8 }, (_, i) => String(y - i)) : [];
  }, [ctx?.Year]);

  const runSearch = async (keepBanner = false) => {
    setLoading(true);
    if (!keepBanner) setBanner(null);
    setPage(0);
    try {
      setRows(await searchPolicies({ empId, year }));
    } catch (err) {
      setRows(null);
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Search failed.' });
    } finally {
      setLoading(false);
    }
  };
  const search = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    void runSearch();
  };

  const open = async (reqNo: string) => {
    setBanner(null);
    setLoading(true);
    try {
      setDetail(await getPolicy(reqNo));
    } catch (err) {
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Could not open the policy.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSearch();
    // first load: the active year's policies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      await deletePolicy(detail.ReqNo);
      setConfirmDelete(false);
      setBanner({ type: 'success', message: 'Request deleted.' });
      setDetail(null);
      void runSearch(true);
    } catch (err) {
      setConfirmDelete(false);
      setBanner({ type: 'error', message: err instanceof Error ? err.message : 'Could not delete the policy.' });
    } finally {
      setDeleting(false);
    }
  };

  const showName = rows?.some((r) => r.FullName);
  const pageRows = rows?.slice(page * PAGE, (page + 1) * PAGE) ?? [];

  if (detail) {
    const canDelete = isHrAdmin && !detail.DelFlag && detail.Year === ctx?.Year;
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setDetail(null)} className="btn-ghost !px-3 !py-1.5 text-[12px]">
            <ArrowLeft size={13} />
            Back to results
          </button>
          {canDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn-danger ml-auto !px-3 !py-1.5 text-[12px]">
              <Trash2 size={13} />
              Delete policy
            </button>
          )}
        </div>
        {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
        <PolicyView policy={detail} />
        {confirmDelete && (
          <ConfirmDialog
            title="Delete this policy?"
            message={`Request ${detail.ReqNo} of employee ${detail.EmpId} will be deleted. The employee can re-apply.`}
            confirmLabel="Delete"
            busy={deleting}
            onConfirm={() => void remove()}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-3 text-[16px] font-extrabold text-ink">Display Policies</h1>
      {banner && <Banner banner={banner} onClose={() => setBanner(null)} />}
      <Section title="Search Criteria" note="Leave Employee ID empty to list all employees">
        <form onSubmit={search} className="flex flex-wrap items-end gap-3">
          <div className="w-full max-w-[200px]">
            <Field label="Employee Id" htmlFor="sEmp">
              <input id="sEmp" className={inputCls()} value={empId} inputMode="numeric" maxLength={8} onChange={(e) => setEmpId(e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <div className="w-full max-w-[160px]">
            <Field label="Year" htmlFor="sYear">
              <select id="sYear" className={selectCls()} value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">All years</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
          </div>
          <button type="submit" disabled={loading} className="btn-primary !px-3 !py-2 text-[12.5px]">
            <Search size={13} />
            Search
          </button>
        </form>
      </Section>

      {loading && <Spinner />}
      {!loading && rows && (
        <Section title="Search Results" note={`${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}`}>
          {rows.length === 0 ? (
            <p className="text-[12.5px] text-inkSoft">No policy available for this search.</p>
          ) : (
            <>
              <TableWrap>
                <table className="w-full min-w-[720px]">
                  <thead className="border-b border-border bg-cream">
                    <tr>
                      <th className={th}>Request Number</th>
                      <th className={th}>Employee ID</th>
                      {showName && <th className={th}>Name</th>}
                      <th className={th}>Year</th>
                      <th className={th}>Request Date</th>
                      <th className={`${th} text-right`}>Base Policy Premium</th>
                      <th className={`${th} text-right`}>Top Up Policy Premium</th>
                      <th className={`${th} text-right`}>Total Premium</th>
                      <th className={`${th} text-right`}>Employee&apos;s Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.ReqNo} className="border-b border-border/60 last:border-0 hover:bg-cream/60">
                        <td className={td}>
                          <button type="button" onClick={() => void open(r.ReqNo)} className="font-bold text-rust hover:underline">{r.ReqNo}</button>
                          {r.DelFlag && <span className="pill ml-1.5 bg-redBg text-red">Deleted</span>}
                        </td>
                        <td className={td}>{r.EmpId}</td>
                        {showName && <td className={td}>{r.FullName}</td>}
                        <td className={td}>{r.Year}</td>
                        <td className={td}>{fmtDate(r.ReqDate)}</td>
                        <td className={tdNum}>{fmtMoney(r.PreBase)}</td>
                        <td className={tdNum}>{fmtMoney(r.TopUpPre)}</td>
                        <td className={tdNum}>{fmtMoney(r.TotalPre)}</td>
                        <td className={tdNum}>{fmtMoney(r.EmpShare)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
              {rows.length > PAGE && (
                <div className="mt-2 flex items-center gap-2 text-[12px] text-inkSoft">
                  <button type="button" className="btn-ghost !px-2.5 !py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                  <span>Page {page + 1} of {Math.ceil(rows.length / PAGE)}</span>
                  <button type="button" className="btn-ghost !px-2.5 !py-1" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage((p) => p + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </Section>
      )}
    </div>
  );
}

export default function AdminPoliciesPage() {
  return (
    <AdminGuard>
      <Policies />
    </AdminGuard>
  );
}
