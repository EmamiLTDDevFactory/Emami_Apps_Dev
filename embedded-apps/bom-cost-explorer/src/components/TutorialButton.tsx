'use client';
/**
 * "Tutorial" in the top bar: plays the narrated walkthrough of the whole app (public/tutorial/). Chapters on the side
 * jump to a topic; captions (WebVTT) can be switched on in the player. The video is only requested when opened.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PlayCircle, X } from 'lucide-react';
import { BASE_PATH } from '@/lib/client/session';
import { cx } from './ui';

interface Chapter { title: string; start: number }
const DIR = `${BASE_PATH}/tutorial`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function TutorialButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Play the tutorial (user manual)"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 text-xs font-semibold text-accent hover:bg-accent/15">
        <PlayCircle size={14} /><span className="hidden sm:inline">Tutorial</span>
      </button>
      {open && <TutorialPlayer onClose={() => setOpen(false)} />}
    </>
  );
}

function TutorialPlayer({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [now, setNow] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(`${DIR}/chapters.json`).then((r) => (r.ok ? r.json() : [])).then((c) => setChapters(Array.isArray(c) ? c : [])).catch(() => setChapters([]));
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  const active = chapters.reduce((a, c, i) => (now >= c.start ? i : a), 0);
  const jump = (s: number) => { if (video.current) { video.current.currentTime = s; void video.current.play(); } };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-3 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="BOM Simulator tutorial" className="flex max-h-full w-[min(1280px,100%)] flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl lg:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-1 flex-col bg-black">
          {failed ? (
            <div className="grid aspect-video place-items-center p-6 text-center text-sm text-white">The tutorial video could not be loaded. Try again later.</div>
          ) : (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video ref={video} className="aspect-[16/10] w-full" controls autoPlay preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} onError={() => setFailed(true)}>
              <source src={`${DIR}/bom-simulator-tutorial.mp4`} type="video/mp4" />
              <track kind="captions" src={`${DIR}/bom-simulator-tutorial.vtt`} srcLang="en" label="English" />
              <track kind="chapters" src={`${DIR}/chapters.vtt`} srcLang="en" label="Chapters" />
            </video>
          )}
        </div>
        <div className="flex w-full flex-col border-t border-line lg:w-72 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-bold">Tutorial · chapters</span>
            <button type="button" aria-label="Close tutorial" onClick={onClose} className="rounded p-1 text-muted hover:bg-sunken hover:text-ink"><X size={16} /></button>
          </div>
          <ol className="scroll-thin max-h-60 overflow-y-auto p-2 text-sm lg:max-h-none lg:flex-1">
            {chapters.map((c, i) => (
              <li key={i}>
                <button type="button" onClick={() => jump(c.start)} className={cx('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-sunken', i === active && 'bg-accent/10 font-semibold text-accent')}>
                  <span className="num w-10 shrink-0 text-xs text-muted">{fmt(c.start)}</span><span>{c.title}</span>
                </button>
              </li>
            ))}
            {!chapters.length && <li className="px-2 py-1.5 text-xs text-muted">Loading chapters…</li>}
          </ol>
        </div>
      </div>
    </div>,
    document.body,
  );
}
