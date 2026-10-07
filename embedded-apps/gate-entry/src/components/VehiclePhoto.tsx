'use client';
import { useRef, useState } from 'react';
import { Camera, ImageUp, ScanLine } from 'lucide-react';
import { readVehicleNumber, shrinkPhoto, type PlateReading } from '@/lib/vision';
import { Button, cx, Spinner } from './ui';

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
        <Button size="sm" disabled={busy} onClick={() => camRef.current?.click()}><Camera size={13} /> Take photo</Button>
        <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><ImageUp size={13} /> Upload photo</Button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
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
