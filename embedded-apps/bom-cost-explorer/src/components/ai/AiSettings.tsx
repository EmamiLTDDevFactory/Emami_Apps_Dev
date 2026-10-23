'use client';
/** AI settings: the person's own Claude API key (this tab, or this device if remembered), the models, a key test. */
import { useState } from 'react';
import { CheckCircle2, KeyRound, ShieldAlert } from 'lucide-react';
import { Button, Modal, cx, inputCls } from '../ui';
import { AI_MODEL_FAST_DEFAULT, AI_MODEL_MAIN_DEFAULT, getApiKey, getModels, isRemembered, setApiKey, setModels } from '@/lib/ai/config';
import { describeError, makeClient } from '@/lib/ai/gateway';

export default function AiSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [key, setKey] = useState(getApiKey());
  const [remember, setRemember] = useState(isRemembered());
  const [models, setM] = useState(getModels());
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'bad'; msg: string }>({ state: 'idle', msg: '' });

  async function runTest() {
    setTest({ state: 'busy', msg: '' });
    try {
      await makeClient(key.trim()).messages.create({ model: models.fast, max_tokens: 16, messages: [{ role: 'user', content: 'Reply OK.' }] });
      setTest({ state: 'ok', msg: 'The key works.' });
    } catch (e) {
      setTest({ state: 'bad', msg: describeError(e) });
    }
  }
  function save() {
    setApiKey(key, remember);
    setModels({ main: models.main.trim() || AI_MODEL_MAIN_DEFAULT, fast: models.fast.trim() || AI_MODEL_FAST_DEFAULT });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="AI settings"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="flex flex-col gap-3 text-sm">
        <label className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted"><KeyRound size={13} /> Claude API key</span>
          <input type="password" autoComplete="off" spellCheck={false} aria-label="Claude API key" className={inputCls} placeholder="sk-ant-…" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device (otherwise only for this browser tab)</label>
        <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-xs">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>The key stays in this browser and is sent only to Anthropic. Costing data you ask about (materials, rates, quantities) is sent to Claude to write answers; vendor names are replaced by V1, V2 … Nothing is ever written to SAP.</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Main model<input className={inputCls} value={models.main} onChange={(e) => setM({ ...models, main: e.target.value })} /></label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">Fast model<input className={inputCls} value={models.fast} onChange={(e) => setM({ ...models, fast: e.target.value })} /></label>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!key.trim() || test.state === 'busy'} onClick={runTest}>{test.state === 'busy' ? 'Testing…' : 'Test key'}</Button>
          {test.msg && <span className={cx('flex items-center gap-1 text-xs', test.state === 'ok' ? 'text-good' : 'text-bad')}>{test.state === 'ok' && <CheckCircle2 size={13} />}{test.msg}</span>}
        </div>
      </div>
    </Modal>
  );
}
