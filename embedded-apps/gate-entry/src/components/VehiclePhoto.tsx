'use client';
import { useRef, useState } from 'react';
import { Camera, ImageUp, KeyRound, ScanLine } from 'lucide-react';
import { getApiKey, KEY_RE, KeyError, readVehicleNumber, setApiKey, shrinkPhoto, type PlateReading } from '@/lib/vision';
import { Button, cx, Field, inputCls, Modal, Spinner } from './ui';

/**
 * Take or attach a photo of the truck; Claude reads the number plate. A confident reading fills the vehicle number
 * (medium asks the user to check it); a doubtful one fills nothing and offers the readings to pick from.
 */
export default function VehiclePhoto({ onPlate }: { onPlate: (plate: string) => void }) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [r, setR] = useState<PlateReading | null>(null);
  const [hasKey, setHasKey] = useState(() => typeof window !== 'undefined' && !!getApiKey());
  const [askKey, setAskKey] = useState<null | 'cam' | 'file' | 'change'>(null);
  const [keyInput, setKeyInput] = useState('');
  const [keyMsg, setKeyMsg] = useState('');

  /** Opens the camera / file picker, asking for the key first when there is none. */
  const open = (which: 'cam' | 'file') => {
    if (!getApiKey()) {
      setKeyInput('');
      setAskKey(which);
      return;
    }
    (which === 'cam' ? camRef : fileRef).current?.click();
  };
  const saveKey = () => {
    const k = keyInput.trim();
    if (!KEY_RE.test(k)) return setKeyMsg('An Anthropic API key starts with sk-ant-');
    setApiKey(k);
    setHasKey(true);
    setKeyMsg('');
    const then = askKey;
    setAskKey(null);
    // still inside the click, so the browser lets the picker open
    if (then === 'cam') camRef.current?.click();
    if (then === 'file') fileRef.current?.click();
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr('');
    setR(null);
    setBusy(true);
    try {
      const { data, preview: p } = await shrinkPhoto(f);
      setPreview(p);
      const reading = await readVehicleNumber(data);
      setR(reading);
      if (reading.plate && reading.confidence !== 'low') onPlate(reading.plate);
      if (!reading.plate) setErr('No vehicle number found in this photo. Take it closer to the number plate.');
    } catch (e) {
      if (e instanceof KeyError) {
        setHasKey(false);
        setKeyMsg(e.message);
        setKeyInput('');
        setAskKey('change');
      }
      setErr(e instanceof Error ? e.message : 'Could not read the photo');
    } finally {
      setBusy(false);
      if (camRef.current) camRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const options = r ? [r.plate, ...r.candidates].filter(Boolean) : [];
  return (
    <div className="mt-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={busy} onClick={() => open('cam')}><Camera size={13} /> Take photo</Button>
        <Button size="sm" disabled={busy} onClick={() => open('file')}><ImageUp size={13} /> Upload photo</Button>
        {hasKey && (
          <Button size="sm" variant="ghost" title="Change or forget the Anthropic API key" onClick={() => { setKeyInput(''); setKeyMsg(''); setAskKey('change'); }}>
            <KeyRound size={13} className="text-good" />
          </Button>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      <Modal
        open={!!askKey}
        onClose={() => setAskKey(null)}
        title="Anthropic API key for reading number plates"
        footer={
          <>
            {hasKey && <Button variant="danger" onClick={() => { setApiKey(''); setHasKey(false); setAskKey(null); }}>Forget key</Button>}
            <Button onClick={() => setAskKey(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveKey}><KeyRound size={14} /> {askKey === 'cam' ? 'Save and take photo' : askKey === 'file' ? 'Save and choose photo' : 'Save key'}</Button>
          </>
        }
      >
        <Field label="API key" error={keyMsg} hint="Kept only in this browser tab until you close it; sent with each photo and never stored on the server.">
          {(id) => (
            <input id={id} type="password" autoComplete="off" spellCheck={false} className={cx(inputCls, 'font-mono')} placeholder="sk-ant-..."
              value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveKey()} autoFocus />
          )}
        </Field>
      </Modal>
      {(preview || busy) && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-sunken/60 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview && <img src={preview} alt="Vehicle photo" className="h-16 w-24 shrink-0 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1 text-2xs">
            {busy && <span className="inline-flex items-center gap-1.5 font-semibold text-muted"><Spinner /> Reading the number plate…</span>}
            {r && r.plate && (
              <>
                <div className={cx('inline-flex items-center gap-1 font-bold', r.confidence === 'high' ? 'text-good' : r.confidence === 'medium' ? 'text-warn' : 'text-bad')}>
                  <ScanLine size={12} />
                  {r.confidence === 'high' ? 'Read from photo' : r.confidence === 'medium' ? 'Read from photo - check it' : 'Not sure - pick the right one'}
                  <span className="font-mono">{r.confidence !== 'low' && r.plate}</span>
                </div>
                {r.confidence === 'low' || r.candidates.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {options.map((p) => (
                      <button key={p} type="button" onClick={() => onPlate(p)} className="rounded-md border border-line bg-panel px-1.5 py-0.5 font-mono text-[11px] font-bold hover:border-accent hover:text-accent">{p}</button>
                    ))}
                  </div>
                ) : null}
                {r.notes && <p className="mt-1 text-faint">{r.notes}</p>}
              </>
            )}
            {err && <p className="text-bad">{err}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
