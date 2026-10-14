'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createChange, getPeople, type ChangeType, type Person } from '@/lib/api';
import { CATEGORY_LABEL, LEVEL_LABEL, PRIORITY_LABEL, ROLE_LABEL, TYPE_HINT, istToIso, riskFromScore } from '@/lib/labels';
import { nameFromEmail } from '@/lib/hub';
import { Button, Card, RiskPill, cx, inputBase, inputCls } from './ui';

const textareaCls = cx('w-full py-2', inputBase);
const opts = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => <option key={k} value={k}>{v}</option>);
const LEVELS = [1, 2, 3].map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>);

export default function ChangeForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [type, setType] = useState<ChangeType>('normal');
  const [impact, setImpact] = useState(2);
  const [likelihood, setLikelihood] = useState(2);
  const [saving, setSaving] = useState<'' | 'draft' | 'submit'>('');
  const [error, setError] = useState('');
  const risk = riskFromScore(impact, likelihood);

  useEffect(() => {
    getPeople().then(setPeople).catch(() => setPeople([]));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const intent = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === 'draft' ? 'draft' : 'submit';
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setError('');
    setSaving(intent);
    try {
      const created = await createChange({ ...f, intent, plannedStart: istToIso(f.plannedStart), plannedEnd: istToIso(f.plannedEnd) });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.');
      setSaving('');
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Raise a change request</h2>
        <p className="text-sm text-muted">
          Standard changes are pre-approved. Normal changes go to the Change Manager, then the CAB. Emergency changes can be approved by the
          CAB Chair (ECAB) and are reviewed after implementation.
        </p>
      </div>

      <Section title="1. What is changing">
        <Field label="Title" full><input name="title" required minLength={5} className={inputCls} placeholder="e.g. Upgrade SAP GUI to 8.00 on all desktops" /></Field>
        <Field label="Change type">
          <select name="changeType" value={type} onChange={(e) => setType(e.target.value as ChangeType)} className={inputCls}>{opts(TYPE_HINT)}</select>
        </Field>
        <Field label="Category"><select name="category" defaultValue="application" className={inputCls}>{opts(CATEGORY_LABEL)}</select></Field>
        <Field label="Priority">
          <select key={type} name="priority" defaultValue={type === 'emergency' ? 'critical' : 'medium'} className={inputCls}>{opts(PRIORITY_LABEL)}</select>
        </Field>
        <Field label="Implementer">
          <select name="implementerEmail" defaultValue="" className={inputCls}>
            <option value="">Me (requester)</option>
            {people.map((p) => <option key={p.email} value={p.email}>{p.name || nameFromEmail(p.email)} · {ROLE_LABEL[p.role] ?? p.role}</option>)}
          </select>
        </Field>
        <Field label="Description" full><textarea name="description" required rows={3} className={textareaCls} /></Field>
        <Field label="Business justification" full>
          <textarea name="justification" required rows={2} className={textareaCls} placeholder="Why is this change needed? What happens if we don't do it?" />
        </Field>
      </Section>

      <Section title="2. Impact & risk">
        <Field label="Affected systems / services" full><input name="affectedSystems" required className={inputCls} placeholder="e.g. SAP PRD, Email, VPN" /></Field>
        <Field label="Affected locations / users"><input name="affectedLocations" className={inputCls} placeholder="e.g. Kolkata HO, all plants" /></Field>
        <Field label="Expected downtime (minutes)"><input name="downtimeMinutes" type="number" min={0} defaultValue={0} className={inputCls} /></Field>
        <Field label="Business impact if it goes wrong">
          <select name="impact" value={impact} onChange={(e) => setImpact(+e.target.value)} className={inputCls}>{LEVELS}</select>
        </Field>
        <Field label="Likelihood of failure">
          <select name="likelihood" value={likelihood} onChange={(e) => setLikelihood(+e.target.value)} className={inputCls}>{LEVELS}</select>
        </Field>
        <div className="flex flex-wrap items-center gap-2 text-[13px] md:col-span-2">
          Calculated risk: <RiskPill risk={risk} />
          {type === 'standard' && risk === 'high' && <span className="font-semibold text-bad">High-risk changes cannot be Standard.</span>}
        </div>
      </Section>

      <Section title="3. Plan & schedule (IST)">
        <Field label="Planned start"><input name="plannedStart" type="datetime-local" required className={inputCls} /></Field>
        <Field label="Planned end"><input name="plannedEnd" type="datetime-local" required className={inputCls} /></Field>
        <Field label="Implementation plan" full><textarea name="implementationPlan" required rows={4} className={textareaCls} placeholder="Step-by-step plan" /></Field>
        <Field label="Rollback plan" full><textarea name="rollbackPlan" required rows={3} className={textareaCls} placeholder="How will you undo the change if it fails?" /></Field>
        <Field label="Test / verification plan" full><textarea name="testPlan" rows={2} className={textareaCls} /></Field>
      </Section>

      {error && <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-sm font-medium text-bad">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" value="draft" disabled={!!saving}>{saving === 'draft' ? 'Saving…' : 'Save as draft'}</Button>
        <Button type="submit" value="submit" variant="primary" disabled={!!saving}>
          {saving === 'submit' ? 'Submitting…' : type === 'standard' ? 'Submit (auto-approved)' : 'Submit for review'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title}>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </Card>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={cx('block', full && 'md:col-span-2')}>
      <span className="mb-1 block text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  );
}
