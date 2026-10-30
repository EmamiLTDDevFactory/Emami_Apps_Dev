'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronRight, Copy, Eye, Folder, FolderOpen, Library, Pencil, Plus, RefreshCw, Search, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { articleFeedback, deleteArticle, getArticle, listArticles, saveArticle } from '@/lib/api';
import { useSetu } from '@/lib/context';
import { fmtDateTime, fmtNum, relative } from '@/lib/format';
import type { Article, ArticleRow, ArticleStatus } from '@/lib/types';
import { Button, Card, Drawer, Empty, Field, Modal, Notice, Pill, Select, Skeleton, Spinner, cx, inputCls, textareaCls } from './ui';

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// "Was this helpful?" counts once per article per browser session.
const VOTE_KEY = 'samadhan.articleVotes';
const votedThisSession = new Set<number>();
function hasVoted(id: number): boolean {
  if (votedThisSession.has(id)) return true;
  try {
    const raw = sessionStorage.getItem(VOTE_KEY);
    return raw ? (JSON.parse(raw) as number[]).includes(id) : false;
  } catch {
    return false;
  }
}
function rememberVote(id: number) {
  votedThisSession.add(id);
  try {
    sessionStorage.setItem(VOTE_KEY, JSON.stringify([...votedThisSession]));
  } catch {
    /* private window: the in-memory set still covers this page */
  }
}

/** Debounced copy of a value (search boxes). */
function useDebounced(value: string, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

type Sel = { category: string; folder: string | null } | null;
type Tree = { category: string; count: number; folders: { folder: string; count: number }[] }[];

function buildTree(items: ArticleRow[]): Tree {
  const cats = new Map<string, Map<string, number>>();
  for (const a of items) {
    const f = cats.get(a.category) ?? new Map<string, number>();
    f.set(a.folder, (f.get(a.folder) ?? 0) + 1);
    cats.set(a.category, f);
  }
  return [...cats.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, f]) => ({
      category,
      count: [...f.values()].reduce((s, n) => s + n, 0),
      folders: [...f.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, count]) => ({ folder, count })),
    }));
}

/** Knowledge base: categories and folders on the left, articles on the right, reader in a drawer. */
export default function Solutions() {
  const { isSupervisor } = useSetu();
  const [all, setAll] = useState<ArticleRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [results, setResults] = useState<ArticleRow[] | null>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [edit, setEdit] = useState<ArticleDraft | null>(null);
  const [notice, setNotice] = useState('');
  const [readerKey, setReaderKey] = useState(0);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setAll(await listArticles({}));
      setError('');
    } catch (e) {
      setError(errText(e, 'Could not load articles.'));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!q) { setResults(null); return; }
    let live = true;
    setResults(null);
    listArticles({ q })
      .then((r) => { if (live) setResults(r); })
      .catch((e: unknown) => { if (live) { setError(errText(e, 'Search failed.')); setResults([]); } });
    return () => { live = false; };
  }, [q]);

  const tree = useMemo(() => buildTree(all ?? []), [all]);

  // Pick the first folder once articles load (and again if the selected one disappears).
  useEffect(() => {
    if (!tree.length) return;
    const ok = sel && tree.some((c) => c.category === sel.category && (sel.folder === null || c.folders.some((f) => f.folder === sel.folder)));
    if (!ok) setSel({ category: tree[0].category, folder: tree[0].folders[0]?.folder ?? null });
  }, [tree, sel]);

  const shown = q
    ? results
    : all && sel
      ? all.filter((a) => a.category === sel.category && (sel.folder === null || a.folder === sel.folder))
      : all;

  const categories = useMemo(() => tree.map((c) => c.category), [tree]);
  const folders = useMemo(() => [...new Set((all ?? []).map((a) => a.folder))].sort(), [all]);

  const toggle = (cat: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(cat)) n.delete(cat); else n.add(cat);
    return n;
  });

  const heading = q ? `Results for "${q}"` : sel ? (sel.folder ? `${sel.category} / ${sel.folder}` : sel.category) : 'Articles';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search articles, text or tags" aria-label="Search articles" className={cx(inputCls, 'pl-8')} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="md" onClick={load} disabled={busy} aria-label="Refresh"><RefreshCw size={14} className={busy ? 'animate-spin' : ''} /></Button>
          {isSupervisor && (
            <Button variant="primary" onClick={() => setEdit({ category: sel?.category ?? 'General', folder: sel?.folder ?? 'General', title: '', tags: '', status: 'published', body: '' })}>
              <Plus size={14} /> New article
            </Button>
          )}
        </div>
      </div>

      {error && <Notice onClose={() => setError('')}>{error}</Notice>}
      {notice && <Notice tone="good" onClose={() => setNotice('')}>{notice}</Notice>}

      <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <Card title="Categories" bodyClass="p-2" className="md:self-start">
          {!all ? (
            <div className="p-2"><Skeleton rows={6} /></div>
          ) : tree.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted">No categories yet.</p>
          ) : (
            <ul className="scroll-thin max-h-48 space-y-0.5 overflow-y-auto md:max-h-[70vh]">
              {tree.map((c) => {
                const open = !collapsed.has(c.category);
                const catActive = !q && sel?.category === c.category && sel.folder === null;
                return (
                  <li key={c.category}>
                    <div className="flex items-center">
                      <button type="button" onClick={() => toggle(c.category)} aria-label={open ? `Collapse ${c.category}` : `Expand ${c.category}`} aria-expanded={open} className="grid h-7 w-6 shrink-0 place-items-center text-faint hover:text-ink">
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSearch(''); setSel({ category: c.category, folder: null }); }}
                        className={cx('flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold transition', catActive ? 'bg-accent/10 text-accent' : 'hover:bg-sunken')}
                      >
                        <span className="truncate">{c.category}</span>
                        <span className="num text-2xs text-muted">{fmtNum(c.count)}</span>
                      </button>
                    </div>
                    {open && (
                      <ul className="ml-6 space-y-0.5">
                        {c.folders.map((f) => {
                          const active = !q && sel?.category === c.category && sel.folder === f.folder;
                          const Icon = active ? FolderOpen : Folder;
                          return (
                            <li key={f.folder}>
                              <button
                                type="button"
                                onClick={() => { setSearch(''); setSel({ category: c.category, folder: f.folder }); }}
                                aria-current={active ? 'true' : undefined}
                                className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] transition', active ? 'bg-accent/10 font-semibold text-accent' : 'text-ink/80 hover:bg-sunken')}
                              >
                                <Icon size={13} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate">{f.folder}</span>
                                <span className="num text-2xs text-muted">{fmtNum(f.count)}</span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={heading} sub={shown ? `${fmtNum(shown.length)} article${shown.length === 1 ? '' : 's'}` : undefined} bodyClass="p-0">
          {!shown ? (
            <div className="p-4"><Skeleton rows={6} /></div>
          ) : shown.length === 0 ? (
            <Empty title={q ? 'No matching articles' : 'No articles here yet'} icon={Library}>
              {q ? 'Try other words.' : isSupervisor ? 'Write the first one with "New article".' : 'Your Samadhan supervisor can add articles.'}
            </Empty>
          ) : (
            <ul className="divide-y divide-line">
              {shown.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => setOpenId(a.id)} className="block w-full px-4 py-3 text-left transition hover:bg-sunken">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold">{a.title}</span>
                      {a.status === 'draft' && <Pill tone="warn">Draft</Pill>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.excerpt}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
                      {q && <span>{a.category} / {a.folder}</span>}
                      <span title={fmtDateTime(a.updatedAt)}>{q ? '· ' : ''}Updated {relative(a.updatedAt)}</span>
                      <span className="num inline-flex items-center gap-1">· <Eye size={11} /> {fmtNum(a.views)}</span>
                      {a.helpful + a.notHelpful > 0 && <span className="num inline-flex items-center gap-1">· <ThumbsUp size={11} /> {fmtNum(a.helpful)}</span>}
                      {a.tags.map((t) => <span key={t} className="rounded bg-sunken px-1">{t}</span>)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {openId !== null && (
        <ArticleReader
          key={`${openId}-${readerKey}`}
          id={openId}
          canEdit={isSupervisor}
          onClose={() => setOpenId(null)}
          onEdit={(a) => setEdit({ id: a.id, category: a.category, folder: a.folder, title: a.title, tags: a.tags.join(', '), status: a.status, body: a.body })}
          onDeleted={async (title) => { setOpenId(null); setNotice(`Deleted "${title}".`); await load(); }}
        />
      )}

      {edit && (
        <ArticleForm
          draft={edit}
          categories={categories}
          folders={folders}
          onClose={() => setEdit(null)}
          onSaved={async (d) => {
            setEdit(null);
            setNotice(d.id ? 'Article saved.' : 'Article added.');
            setSel({ category: d.category.trim() || 'General', folder: d.folder.trim() || 'General' });
            await load();
            setReaderKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Reader

function ArticleReader({ id, canEdit, onClose, onEdit, onDeleted }: { id: number; canEdit: boolean; onClose: () => void; onEdit: (a: Article) => void; onDeleted: (title: string) => void | Promise<void> }) {
  const [a, setA] = useState<Article | null>(null);
  const [error, setError] = useState('');
  const [voted, setVoted] = useState(() => hasVoted(id));
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setA(null);
    getArticle(id).then((r) => { if (live) setA(r); }).catch((e: unknown) => { if (live) setError(errText(e, 'Could not open the article.')); });
    return () => { live = false; };
  }, [id]);

  const vote = async (helpful: boolean) => {
    rememberVote(id);
    setVoted(true);
    try {
      await articleFeedback(id, helpful);
    } catch {
      /* feedback is best effort */
    }
  };
  const copy = async () => {
    if (!a) return;
    try {
      await navigator.clipboard.writeText(`${a.title}\n\n${a.body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. Select the text and copy it by hand.');
    }
  };
  const remove = async () => {
    if (!a || !confirm(`Delete "${a.title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteArticle(a.id);
      await onDeleted(a.title);
    } catch (e) {
      setError(errText(e, 'Could not delete the article.'));
    } finally {
      setBusy(false);
    }
  };

  const title = a ? (
    <div className="min-w-0">
      <p className="truncate text-2xs font-semibold text-muted">{a.category} / {a.folder}</p>
      <h2 className="flex flex-wrap items-center gap-2 text-base font-bold">{a.title}{a.status === 'draft' && <Pill tone="warn">Draft</Pill>}</h2>
    </div>
  ) : <h2 className="text-base font-bold">Article</h2>;

  return (
    <Drawer open onClose={onClose} title={title} width={720}>
      {error && <div className="mb-3"><Notice onClose={() => setError('')}>{error}</Notice></div>}
      {!a ? (
        !error && <Skeleton rows={12} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-muted">
              <span title={fmtDateTime(a.updatedAt)}>Updated {relative(a.updatedAt)}</span>
              {a.authorName && <span>· by {a.authorName}</span>}
              <span className="num inline-flex items-center gap-1">· <Eye size={11} /> {fmtNum(a.views)} view{a.views === 1 ? '' : 's'}</span>
              {a.tags.map((t) => <span key={t} className="rounded bg-sunken px-1">{t}</span>)}
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy text'}</Button>
              {canEdit && (
                <>
                  <Button size="sm" onClick={() => onEdit(a)}><Pencil size={13} /> Edit</Button>
                  <Button size="sm" onClick={remove} disabled={busy} aria-label="Delete article" className="text-bad">{busy ? <Spinner /> : <Trash2 size={13} />} <span className="hidden sm:inline">Delete</span></Button>
                </>
              )}
            </div>
          </div>

          <Card bodyClass="p-5">
            <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{a.body}</div>
          </Card>

          {a.status === 'published' && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-3 text-[13px]">
              {voted ? (
                <span className="font-semibold text-good">Thanks for the feedback.</span>
              ) : (
                <>
                  <span className="font-semibold">Was this helpful?</span>
                  <Button size="sm" onClick={() => vote(true)}><ThumbsUp size={13} /> Yes</Button>
                  <Button size="sm" onClick={() => vote(false)}><ThumbsDown size={13} /> No</Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------- Editor

type ArticleDraft = { id?: number; category: string; folder: string; title: string; tags: string; status: ArticleStatus; body: string };

function ArticleForm({ draft, categories, folders, onClose, onSaved }: { draft: ArticleDraft; categories: string[]; folders: string[]; onClose: () => void; onSaved: (d: ArticleDraft) => void | Promise<void> }) {
  const [f, setF] = useState<ArticleDraft>(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await saveArticle({ id: f.id, category: f.category.trim(), folder: f.folder.trim(), title: f.title.trim(), body: f.body, status: f.status, tags: f.tags });
      await onSaved(f);
    } catch (e) {
      setError(errText(e, 'Could not save the article.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={f.id ? 'Edit article' : 'New article'} width={760}>
      <div className="space-y-3">
        <Field label="Title" required><input autoFocus className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Category">
            <input className={inputCls} list="samadhan-article-categories" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="samadhan-article-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Folder">
            <input className={inputCls} list="samadhan-article-folders" value={f.folder} onChange={(e) => setF({ ...f, folder: e.target.value })} />
            <datalist id="samadhan-article-folders">{folders.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="Status">
            <Select label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v === 'draft' ? 'draft' : 'published' })} options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft (only supervisors see it)' }]} className="w-full" />
          </Field>
        </div>
        <Field label="Tags" hint="Comma separated, e.g. returns, credit note"><input className={inputCls} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></Field>
        <Field label="Text" required hint="Plain text. Line breaks are kept as typed.">
          <textarea rows={14} className={textareaCls} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || !f.title.trim() || !f.body.trim()}>{busy && <Spinner />} Save</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Composer button

/** Reply-composer toolbar button: find a published article and insert its title and text into the reply. */
export function InsertArticleButton({ onInsert }: { onInsert: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Insert a Solutions article into the reply">
        <BookOpen size={13} /> <span className="hidden sm:inline">Insert article</span>
      </Button>
      {open && <InsertArticleModal onClose={() => setOpen(false)} onInsert={(t) => { onInsert(t); setOpen(false); }} />}
    </>
  );
}

function InsertArticleModal({ onClose, onInsert }: { onClose: () => void; onInsert: (text: string) => void }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [items, setItems] = useState<ArticleRow[] | null>(null);
  const [error, setError] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    setItems(null);
    listArticles({ q: q || undefined })
      .then((r) => { if (live) setItems(r.filter((a) => a.status === 'published')); })
      .catch((e: unknown) => { if (live) { setError(errText(e, 'Could not load articles.')); setItems([]); } });
    return () => { live = false; };
  }, [q]);

  useEffect(() => {
    if (pick === null) { setArticle(null); return; }
    let live = true;
    setLoading(true);
    setArticle(null);
    getArticle(pick)
      .then((r) => { if (live) setArticle(r); })
      .catch((e: unknown) => { if (live) setError(errText(e, 'Could not open the article.')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [pick]);

  const picked = items?.find((a) => a.id === pick);

  return (
    <Modal open onClose={onClose} title="Insert article" width={820}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search published articles" aria-label="Search articles" className={cx(inputCls, 'pl-8')} />
        </div>
        {error && <Notice onClose={() => setError('')}>{error}</Notice>}
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="scroll-thin max-h-[50vh] overflow-y-auto rounded-xl border border-line">
            {!items ? (
              <div className="p-3"><Skeleton rows={5} /></div>
            ) : items.length === 0 ? (
              <Empty title={q ? 'No matching articles' : 'No published articles'} icon={Library} />
            ) : (
              <ul className="divide-y divide-line">
                {items.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => setPick(a.id)} aria-pressed={pick === a.id} className={cx('block w-full px-3 py-2 text-left transition', pick === a.id ? 'bg-accent/10' : 'hover:bg-sunken')}>
                      <div className={cx('truncate text-[13px] font-semibold', pick === a.id && 'text-accent')}>{a.title}</div>
                      <div className="truncate text-2xs text-muted">{a.category} / {a.folder}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex min-h-[200px] flex-col rounded-xl border border-line bg-sunken/40">
            {pick === null ? (
              <p className="m-auto px-4 text-center text-xs text-muted">Pick an article to preview it.</p>
            ) : loading || !article ? (
              <div className="p-3"><Skeleton rows={6} /></div>
            ) : (
              <>
                <div className="border-b border-line px-3 py-2">
                  <div className="text-[13px] font-bold">{article.title}</div>
                  <div className="text-2xs text-muted">{picked ? `${picked.category} / ${picked.folder}` : `${article.category} / ${article.folder}`}</div>
                </div>
                <div className="scroll-thin max-h-[40vh] flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-[13px]">{article.body}</div>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!article} onClick={() => article && onInsert(`${article.title}\n\n${article.body}`)}>
            <BookOpen size={14} /> Insert
          </Button>
        </div>
      </div>
    </Modal>
  );
}
