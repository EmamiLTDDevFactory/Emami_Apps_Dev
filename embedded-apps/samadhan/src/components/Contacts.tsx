'use client';
import { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, ListFilter, Pencil, PhoneIncoming, PhoneOutgoing, Plus, RefreshCw, Search, Users, X } from 'lucide-react';
import { getContact, listCompanies, listContacts, saveCompany, updateContact } from '@/lib/api';
import { useSamadhan } from '@/lib/context';
import { SEVERITY_EDGE, fmtDateTime, fmtNum, relative } from '@/lib/format';
import type { Company, ContactDetail, ContactRow } from '@/lib/types';
import { PriorityPill, SeverityPill, SlaBadge, StatusPill } from './badges';
import { Avatar, Button, Card, Drawer, Empty, Field, Modal, Notice, Select, Skeleton, Spinner, Table, cx, inputCls, textareaCls } from './ui';

type Tab = 'contacts' | 'companies';
const PAGE_SIZE = 50;
const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Contacts (requesters) and the companies they belong to. */
export default function Contacts() {
  const [tab, setTab] = useState<Tab>('contacts');
  const [company, setCompany] = useState<{ id: number; name: string } | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [companiesError, setCompaniesError] = useState('');

  const loadCompanies = useCallback(async () => {
    try {
      setCompanies(await listCompanies());
      setCompaniesError('');
    } catch (e) {
      setCompaniesError(errText(e, 'Could not load companies.'));
    }
  }, []);
  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const tabs: { id: Tab; label: string }[] = [{ id: 'contacts', label: 'Contacts' }, { id: 'companies', label: 'Companies' }];

  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Contacts and companies" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t.id ? 'bg-panel text-accent shadow-card ring-1 ring-line' : 'text-muted hover:text-ink')}
          >
            {t.id === 'contacts' ? <Users size={13} /> : <Building2 size={13} />}
            {t.label}
            {t.id === 'companies' && companies && <span className="num rounded-md bg-line/70 px-1.5 text-2xs text-muted">{fmtNum(companies.length)}</span>}
          </button>
        ))}
      </div>

      {tab === 'contacts' ? (
        <ContactList key={company?.id ?? 0} company={company} onClearCompany={() => setCompany(null)} companies={companies ?? []} />
      ) : (
        <CompanyList
          companies={companies}
          error={companiesError}
          onError={setCompaniesError}
          reload={loadCompanies}
          onPick={(c) => { setCompany({ id: c.id, name: c.name }); setTab('contacts'); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Contacts tab

function ContactList({ company, onClearCompany, companies }: { company: { id: number; name: string } | null; onClearCompany: () => void; companies: Company[] }) {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  // Debounced search box.
  useEffect(() => {
    const id = setTimeout(() => {
      const next = search.trim();
      if (next !== q) { setQ(next); setPage(1); }
    }, 350);
    return () => clearTimeout(id);
  }, [search, q]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await listContacts({ q: q || undefined, page, companyId: company?.id });
      setRows(r.items);
      setTotal(r.total);
      setError('');
    } catch (e) {
      setError(errText(e, 'Could not load contacts.'));
    } finally {
      setBusy(false);
    }
  }, [q, page, company?.id]);
  useEffect(() => { load(); }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {company && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/15 px-2 py-1 text-xs font-semibold text-accent">
              <Building2 size={12} /> Company: {company.name}
              <button type="button" onClick={onClearCompany} aria-label="Clear company filter" className="opacity-70 hover:opacity-100"><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, mobile or phone" aria-label="Search contacts" className={cx(inputCls, 'pl-8 sm:w-72')} />
          </div>
          <Button size="md" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>
        </div>
      </div>

      {error && <Notice onClose={() => setError('')}>{error}</Notice>}

      <Card bodyClass="p-0">
        {!rows ? (
          <div className="p-4"><Skeleton /></div>
        ) : rows.length === 0 ? (
          <Empty title="No contacts found" icon={Users}>{q || company ? 'Try another search, or clear the company filter.' : 'Contacts appear here when tickets come in.'}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpenId(c.id)} className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition hover:bg-sunken md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar email={c.email ?? c.mobile ?? c.phone ?? String(c.id)} name={c.name} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-muted">
                        {c.email && <span className="truncate">{c.email}</span>}
                        {(c.mobile || c.phone) && <span className="num">{c.email ? '· ' : ''}{c.mobile ?? c.phone}</span>}
                        {c.companyName && <span className="inline-flex items-center gap-1">· <Building2 size={10} /> {c.companyName}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-[42px] text-2xs text-muted md:justify-end md:pl-0">
                    <span className="num">{fmtNum(c.tickets)} ticket{c.tickets === 1 ? '' : 's'}</span>
                    {c.open > 0 && <span className="num rounded-md bg-accent/15 px-1.5 font-semibold text-accent">{fmtNum(c.open)} open</span>}
                    <span className="w-24 text-right" title={c.lastTicketAt ? fmtDateTime(c.lastTicketAt) : 'No tickets'}>{c.lastTicketAt ? relative(c.lastTicketAt) : '—'}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {rows && total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-2xs text-muted">
            <span className="num">{fmtNum((page - 1) * PAGE_SIZE + 1)}–{fmtNum(Math.min(total, page * PAGE_SIZE))} of {fmtNum(total)}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Button>
              <span className="num">Page {page} of {pages}</span>
              <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></Button>
            </div>
          </div>
        )}
      </Card>

      {openId !== null && <ContactDrawer id={openId} companies={companies} onClose={() => setOpenId(null)} onSaved={load} />}
    </>
  );
}

function ContactDrawer({ id, companies, onClose, onSaved }: { id: number; companies: Company[]; onClose: () => void; onSaved: () => void }) {
  const { openTicket, openList } = useSamadhan();
  const [data, setData] = useState<ContactDetail | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getContact(id));
      setError('');
    } catch (e) {
      setError(errText(e, 'Could not load the contact.'));
    }
  }, [id]);
  useEffect(() => { setData(null); load(); }, [load]);

  const c = data?.contact;
  const title = c ? (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar email={c.email ?? c.mobile ?? c.phone ?? String(c.id)} name={c.name} size={40} />
      <div className="min-w-0">
        <h2 className="truncate text-base font-bold">{c.name}</h2>
        <p className="truncate text-2xs text-muted">{c.companyName ?? 'No company'} · contact since {fmtDateTime(c.createdAt)}</p>
      </div>
    </div>
  ) : <h2 className="text-base font-bold">Contact</h2>;

  return (
    <Drawer open onClose={onClose} title={title} width={680}>
      {error && <div className="mb-3"><Notice onClose={() => setError('')}>{error}</Notice></div>}
      {!data || !c ? (
        !error && <Skeleton rows={10} />
      ) : (
        <div className="space-y-4">
          <Card
            title="Details"
            actions={!editing && <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} /> Edit</Button>}
          >
            {editing ? (
              <ContactForm
                contact={c}
                companies={companies}
                onCancel={() => setEditing(false)}
                onSaved={async () => { setEditing(false); await load(); onSaved(); }}
              />
            ) : (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
                <Detail label="Name" value={c.name} />
                <Detail label="Email" value={c.email} />
                <Detail label="Phone" value={c.phone} num />
                <Detail label="Mobile" value={c.mobile} num />
                <Detail label="Company" value={c.companyName} />
              </dl>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="Tickets" value={fmtNum(data.stats.total)} />
            <Stat label="Open" value={fmtNum(data.stats.open)} tone={data.stats.open > 0 ? 'text-accent' : undefined} />
            <Stat label="Avg CSAT" value={data.stats.csatAvg !== null ? `${Number(data.stats.csatAvg).toFixed(1)} / 3` : '—'} />
          </div>

          <Card
            title="Tickets"
            sub={data.tickets.length >= 50 ? 'Latest 50' : undefined}
            bodyClass="p-0"
            actions={data.stats.total > 0 && (
              <Button size="sm" onClick={() => { onClose(); openList({ view: '', requesterId: String(id) }); }}><ListFilter size={13} /> See all tickets</Button>
            )}
          >
            {data.tickets.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No tickets from this contact.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.tickets.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => { onClose(); openTicket(t.id); }} className={cx('grid w-full grid-cols-1 gap-1.5 border-l-4 px-4 py-3 text-left transition hover:bg-sunken', SEVERITY_EDGE[t.severity])}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="num text-2xs font-bold text-muted">#{t.id}</span>
                          <span className="truncate text-sm font-semibold">{t.subject}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
                          <span>{t.source}</span>
                          <span title={fmtDateTime(t.createdAt)}>· {relative(t.createdAt)}</span>
                          {t.category && <span className="truncate">· {t.category}{t.function ? ` → ${t.function}` : ''}</span>}
                          <span>· {t.agentName ?? <em className="text-warn">Unassigned</em>}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityPill severity={t.severity} />
                        <PriorityPill priority={t.priority} />
                        <StatusPill t={t} />
                        <SlaBadge t={t} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent calls" bodyClass="p-0">
            {data.calls.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">No calls logged.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.calls.map((call) => {
                  const ticketId = (call as typeof call & { ticketId?: number }).ticketId;
                  const Icon = call.direction === 'INBOUND' ? PhoneIncoming : PhoneOutgoing;
                  return (
                    <li key={call.id} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sunken text-muted"><Icon size={14} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-semibold">{call.direction === 'INBOUND' ? 'Inbound' : 'Outbound'}</span>
                          <span className="text-muted">· {call.outcome}</span>
                          <span className="num text-muted">· {Math.max(1, Math.round(call.durationSecs / 60))} min</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-2xs text-muted">
                          <span>{call.agentName}</span>
                          <span title={fmtDateTime(call.createdAt)}>· {relative(call.createdAt)}</span>
                          {ticketId ? (
                            <button type="button" onClick={() => { onClose(); openTicket(ticketId); }} className="min-w-0 truncate font-semibold text-accent hover:underline">· #{ticketId} {call.ticketSubject}</button>
                          ) : (
                            <span className="truncate">· {call.ticketSubject}</span>
                          )}
                        </div>
                        {call.notes && <p className="mt-0.5 whitespace-pre-wrap text-2xs text-ink/80">{call.notes}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Drawer>
  );
}

function Detail({ label, value, num }: { label: string; value: string | null; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cx('truncate', num && 'num', !value && 'text-faint')}>{value || '—'}</dd>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2 shadow-card">
      <div className="text-2xs font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('num text-lg font-extrabold', tone)}>{value}</div>
    </div>
  );
}

function ContactForm({ contact, companies, onCancel, onSaved }: { contact: ContactRow; companies: Company[]; onCancel: () => void; onSaved: () => void | Promise<void> }) {
  const [f, setF] = useState({
    name: contact.name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    mobile: contact.mobile ?? '',
    companyId: contact.companyId ? String(contact.companyId) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await updateContact(contact.id, {
        name: f.name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim(),
        mobile: f.mobile.trim(),
        companyId: f.companyId ? Number(f.companyId) : null,
      });
      await onSaved();
    } catch (e) {
      setError(errText(e, 'Could not save the contact.'));
    } finally {
      setBusy(false);
    }
  };

  // Keep the current company selectable even if the list has not loaded yet.
  const options = [{ value: '', label: 'No company' }, ...companies.map((co) => ({ value: String(co.id), label: co.name }))];
  if (contact.companyId && !companies.some((co) => co.id === contact.companyId)) options.push({ value: String(contact.companyId), label: contact.companyName ?? `Company #${contact.companyId}` });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><input type="tel" className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Mobile"><input type="tel" className={inputCls} value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Company" className="sm:col-span-2">
          <Select label="Company" value={f.companyId} onChange={(v) => setF({ ...f, companyId: v })} options={options} className="w-full" />
        </Field>
      </div>
      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy || !f.name.trim()}>{busy && <Spinner />} Save</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Companies tab

type CompanyDraft = { id?: number; name: string; description: string; domains: string };

function CompanyList({ companies, error, onError, reload, onPick }: { companies: Company[] | null; error: string; onError: (m: string) => void; reload: () => Promise<void>; onPick: (c: Company) => void }) {
  const { isSupervisor } = useSamadhan();
  const [edit, setEdit] = useState<CompanyDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState('');

  const startEdit = (c?: Company) => {
    setFormError('');
    setEdit(c ? { id: c.id, name: c.name, description: c.description ?? '', domains: c.domains.join(', ') } : { name: '', description: '', domains: '' });
  };
  const save = async () => {
    if (!edit) return;
    setBusy(true);
    setFormError('');
    try {
      await saveCompany({ id: edit.id, name: edit.name.trim(), description: edit.description.trim(), domains: edit.domains });
      await reload();
      setSaved(edit.id ? 'Company updated.' : 'Company added.');
      setEdit(null);
    } catch (e) {
      setFormError(errText(e, 'Could not save the company.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Click a company to see its contacts.</p>
        <div className="flex items-center gap-2">
          <Button size="md" onClick={() => reload()} aria-label="Refresh"><RefreshCw size={14} /></Button>
          {isSupervisor && <Button variant="primary" onClick={() => startEdit()}><Plus size={14} /> New company</Button>}
        </div>
      </div>

      {error && <Notice onClose={() => onError('')}>{error}</Notice>}
      {saved && <Notice tone="good" onClose={() => setSaved('')}>{saved}</Notice>}

      <Card bodyClass="p-0">
        {!companies ? (
          <div className="p-4"><Skeleton rows={6} /></div>
        ) : companies.length === 0 ? (
          <Empty title="No companies yet" icon={Building2}>{isSupervisor ? 'Add a company and its email domains; contacts from those domains are linked to it.' : 'Your Samadhan supervisor can add companies.'}</Empty>
        ) : (
          <Table head={['Company', 'Domains', 'Contacts', 'Open', 'Tickets', ...(isSupervisor ? [''] : [])]}>
            {companies.map((co) => (
              <tr key={co.id} className="cursor-pointer transition hover:bg-sunken" onClick={() => onPick(co)}>
                <td className="px-3 py-2.5">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onPick(co); }} className="text-left font-semibold hover:text-accent">{co.name}</button>
                  {co.description && <div className="max-w-xs truncate text-2xs text-muted">{co.description}</div>}
                </td>
                <td className="px-3 py-2.5 text-2xs text-muted">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {co.domains.length ? co.domains.map((d) => <span key={d} className="rounded bg-sunken px-1">{d}</span>) : '—'}
                  </div>
                </td>
                <td className="num px-3 py-2.5">{fmtNum(co.contacts)}</td>
                <td className="num px-3 py-2.5">{co.open > 0 ? <span className="rounded-md bg-accent/15 px-1.5 font-semibold text-accent">{fmtNum(co.open)}</span> : '0'}</td>
                <td className="num px-3 py-2.5">{fmtNum(co.tickets)}</td>
                {isSupervisor && (
                  <td className="px-3 py-2.5 text-right">
                    <Button size="sm" variant="ghost" aria-label={`Edit ${co.name}`} onClick={(e) => { e.stopPropagation(); startEdit(co); }}><Pencil size={13} /> <span className="hidden sm:inline">Edit</span></Button>
                  </td>
                )}
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? 'Edit company' : 'New company'}>
        {edit && (
          <div className="space-y-3">
            <Field label="Name" required><input autoFocus className={inputCls} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Description"><textarea rows={3} className={textareaCls} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Domains" hint="Comma separated, e.g. emamigroup.com, emami.in">
              <input className={inputCls} value={edit.domains} onChange={(e) => setEdit({ ...edit, domains: e.target.value })} />
            </Field>
            {formError && <Notice onClose={() => setFormError('')}>{formError}</Notice>}
            <div className="flex justify-end gap-2">
              <Button onClick={() => setEdit(null)} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={busy || !edit.name.trim()}>{busy && <Spinner />} Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
