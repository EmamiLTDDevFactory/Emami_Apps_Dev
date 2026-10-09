'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Check, KeyRound, Loader2, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAppStages } from '../../context/AppStagesContext';
import { useFavorites } from '../../context/FavoritesContext';
import { colors, fontWeights, fonts, gradients, radii, shadows } from '../../theme/tokens';
import { describeError, makeClient, runTurn, type Turn } from '../../lib/assistant/agent';
import type { AssistantContext } from '../../lib/assistant/tools';
import { VOICE_LANGS, canListen, listenOnce, speak, stopSpeaking, yesNo, type VoiceLang } from '../../lib/assistant/speech';
import { storage } from '../../lib/storage';

/** The person's own Claude API key: kept only in this browser tab (sessionStorage), sent only to api.anthropic.com. */
const KEY_STORE = 'emami_apps_assistant_key';
const LANG_STORE = '@emami_hub/assistant_lang';
const TOOL_LABEL: Record<string, string> = {
  list_my_apps: 'Checking your apps…',
  find_apps: 'Looking for the app…',
  open_app: 'Opening the app…',
  go_to_page: 'Going there…',
  set_favorite: 'Updating favourites…',
  app_status_summary: 'Reading app status…',
  set_app_status: 'Changing app status…',
  find_people: 'Looking up people…',
  grant_app_access: 'Granting access…',
  revoke_app_access: 'Removing access…',
  usage_overview: 'Reading usage…',
};

type Line = { id: number; who: 'you' | 'bot' | 'note'; text: string };
const readKey = () => {
  try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
};

export default function AssistantPanel() {
  const router = useRouter();
  const { userEmail, access } = useAuth();
  const { stageOf, applySaved } = useAppStages();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [lang, setLang] = useState<VoiceLang>('en-IN');
  const [voiceOn, setVoiceOn] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [pending, setPending] = useState<{ summary: string; resolve: (v: boolean) => void } | null>(null);

  const history = useRef<Turn[]>([]);
  const stopListen = useRef<(() => void) | null>(null);
  const lineId = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const isAdmin = access?.accessLevel === 'Super Admin' || access?.accessLevel === 'Admin';

  useEffect(() => {
    setApiKey(readKey());
    const l = storage.getItem(LANG_STORE);
    if (l === 'en-IN' || l === 'hi-IN' || l === 'bn-IN') setLang(l);
  }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [lines, busy, pending, heard]);

  const add = (who: Line['who'], text: string) => setLines((l) => [...l, { id: ++lineId.current, who, text }]);

  // Always the current values, read by the tools while a turn runs.
  const ctxRef = useRef<AssistantContext>(null as unknown as AssistantContext);
  ctxRef.current = {
    userEmail: userEmail ?? '',
    access,
    isAdmin,
    stageOf,
    applySaved,
    isFavorite,
    toggleFavorite,
    navigate: (path) => router.push(path),
    confirm: (summary) => new Promise<boolean>((resolve) => setPending({ summary, resolve })),
  };

  const answerConfirm = useCallback((yes: boolean) => {
    setPending((p) => {
      p?.resolve(yes);
      return null;
    });
    add('note', yes ? 'Confirmed' : 'Cancelled');
  }, []);

  const ask = useCallback(async (text: string) => {
    const q = text.trim();
    if (!q) return;
    if (pending) {
      const yn = yesNo(q);
      if (yn !== null) return answerConfirm(yn);
    }
    if (!apiKey) return setEditingKey(true);
    stopSpeaking();
    add('you', q);
    setDraft('');
    setBusy('Thinking…');
    history.current.push({ role: 'user', content: q });
    try {
      const reply = await runTurn(makeClient(apiKey), history.current, ctxRef.current, { onTool: (n) => setBusy(TOOL_LABEL[n] ?? 'Working…') });
      add('bot', reply || 'Done.');
      if (voiceOn) speak(reply);
    } catch (e) {
      // Keep the history valid for the next turn: drop this unanswered question.
      while (history.current.length && history.current[history.current.length - 1].role === 'user') history.current.pop();
      add('note', describeError(e));
    } finally {
      setBusy(null);
    }
  }, [apiKey, pending, voiceOn, answerConfirm]);

  const toggleMic = async () => {
    if (listening) return stopListen.current?.();
    stopSpeaking();
    setHeard('');
    setListening(true);
    const { done, stop } = listenOnce(lang, setHeard);
    stopListen.current = stop;
    try {
      const text = await done;
      setHeard('');
      if (text) await ask(text);
    } catch (e) {
      add('note', e instanceof Error ? e.message : 'Could not listen.');
    } finally {
      setListening(false);
      stopListen.current = null;
    }
  };

  const saveKey = () => {
    const k = keyDraft.trim();
    if (!k) return;
    try { sessionStorage.setItem(KEY_STORE, k); } catch { /* private mode: keep it in memory only */ }
    setApiKey(k);
    setKeyDraft('');
    setEditingKey(false);
  };
  const forgetKey = () => {
    try { sessionStorage.removeItem(KEY_STORE); } catch { /* ignore */ }
    setApiKey('');
    setEditingKey(true);
  };
  const pickLang = (l: VoiceLang) => {
    setLang(l);
    storage.setItem(LANG_STORE, l);
  };

  const greeting = lang === 'bn-IN'
    ? 'নমস্কার! বলুন, Emami Apps-এ কী করতে চান - যেমন "Non CTC Expense খোলো"।'
    : lang === 'hi-IN'
      ? 'नमस्ते! बताइए, Emami Apps में क्या करना है - जैसे "Gate Entry खोलो"।'
      : 'Hi! Tell me what to do in Emami Apps - for example "open Gate Entry" or "which apps can I use?"';

  if (!userEmail) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the Emami Apps assistant"
          title="Assistant (English, हिन्दी, বাংলা)"
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 90, width: 56, height: 56, borderRadius: 28, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${gradients.primary.join(', ')})`, color: colors.white, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.lg }}
        >
          <Mic size={24} />
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="Emami Apps assistant"
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 95, width: 'min(400px, calc(100vw - 32px))', height: 'min(620px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', backgroundColor: colors.white, borderRadius: radii.xxl, border: `1px solid ${colors.border}`, boxShadow: shadows.xl, overflow: 'hidden', fontFamily: fonts.sansRegular }}
        >
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${colors.border}` }}>
            <span style={{ width: 34, height: 34, borderRadius: radii.lg, backgroundColor: `${colors.rust}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Bot size={18} color={colors.rust} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontFamily: fonts.sansBold, fontWeight: fontWeights.sansBold, color: colors.ink }}>Emami Assistant</p>
              <p style={{ margin: 0, fontSize: 11, color: colors.inkSoft }}>English · हिन्दी · বাংলা</p>
            </div>
            <IconBtn label={voiceOn ? 'Turn spoken replies off' : 'Turn spoken replies on'} onClick={() => { if (voiceOn) stopSpeaking(); setVoiceOn(!voiceOn); }}>
              {voiceOn ? <Volume2 size={16} color={colors.inkSoft} /> : <VolumeX size={16} color={colors.inkSoft} />}
            </IconBtn>
            <IconBtn label="Claude API key" onClick={() => setEditingKey((v) => !v)}><KeyRound size={16} color={apiKey ? colors.green : colors.inkSoft} /></IconBtn>
            <IconBtn label="Close" onClick={() => { stopSpeaking(); stopListen.current?.(); setOpen(false); }}><X size={17} color={colors.inkSoft} /></IconBtn>
          </header>

          <div style={{ display: 'flex', gap: 6, padding: '8px 14px', borderBottom: `1px solid ${colors.border}`, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: colors.inkSoft, marginRight: 4 }}>I&apos;ll listen in</span>
            {VOICE_LANGS.map((v) => (
              <button key={v.lang} type="button" onClick={() => pickLang(v.lang)} aria-pressed={lang === v.lang}
                style={{ border: `1px solid ${lang === v.lang ? colors.rust : colors.border}`, backgroundColor: lang === v.lang ? `${colors.rust}12` : colors.white, color: lang === v.lang ? colors.rust : colors.ink, borderRadius: radii.pill, padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>
                {v.label}
              </button>
            ))}
          </div>

          {(editingKey || !apiKey) && (
            <div style={{ padding: 14, borderBottom: `1px solid ${colors.border}`, backgroundColor: colors.cream }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, color: colors.inkSoft }}>
                The assistant uses Claude with <b>your own Anthropic API key</b>. It stays only in this browser tab and is sent only to Anthropic.
              </p>
              <form onSubmit={(e) => { e.preventDefault(); saveKey(); }} style={{ display: 'flex', gap: 8 }}>
                <input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" aria-label="Anthropic API key"
                  style={{ flex: 1, minWidth: 0, height: 36, borderRadius: radii.lg, border: `1px solid ${colors.border}`, padding: '0 10px', fontSize: 13, fontFamily: fonts.sansRegular }} />
                <button type="submit" disabled={!keyDraft.trim()} style={{ height: 36, padding: '0 14px', border: 'none', borderRadius: radii.lg, background: colors.rust, color: colors.white, cursor: 'pointer', fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, opacity: keyDraft.trim() ? 1 : 0.5 }}>Save</button>
              </form>
              {apiKey && <button type="button" onClick={forgetKey} style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#DC2626' }}>Forget the saved key</button>}
            </div>
          )}

          <div ref={scroller} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: colors.appBg }}>
            {!lines.length && <Bubble who="bot" text={greeting} />}
            {lines.map((l) => (l.who === 'note'
              ? <p key={l.id} style={{ margin: 0, alignSelf: 'center', fontSize: 11.5, color: colors.inkSoft, textAlign: 'center' }}>{l.text}</p>
              : <Bubble key={l.id} who={l.who} text={l.text} />))}
            {heard && <Bubble who="you" text={heard} faded />}
            {pending && (
              <div style={{ alignSelf: 'stretch', backgroundColor: colors.white, border: `1px solid ${colors.rust}55`, borderRadius: radii.xl, padding: 12 }}>
                <p style={{ margin: '0 0 10px', fontSize: 13, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, color: colors.ink }}>{pending.summary}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => answerConfirm(true)} style={{ flex: 1, height: 34, border: 'none', borderRadius: radii.lg, background: colors.rust, color: colors.white, cursor: 'pointer', fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Check size={14} /> Yes · হ্যাঁ · हाँ</button>
                  <button type="button" onClick={() => answerConfirm(false)} style={{ flex: 1, height: 34, border: `1px solid ${colors.border}`, borderRadius: radii.lg, background: colors.white, color: colors.ink, cursor: 'pointer', fontSize: 12.5, fontFamily: fonts.sansSemiBold, fontWeight: fontWeights.sansSemiBold }}>No · না · नहीं</button>
                </div>
              </div>
            )}
            {busy && !pending && (
              <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: colors.inkSoft }}><Loader2 size={13} className="assistant-spin" /> {busy}</p>
            )}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); void ask(draft); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, borderTop: `1px solid ${colors.border}` }}>
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={(!!busy && !pending) || !canListen()}
              aria-label={listening ? 'Stop listening' : 'Speak'}
              title={canListen() ? (listening ? 'Stop listening' : 'Speak') : 'This browser cannot listen - use Chrome or Edge, or type'}
              style={{ width: 44, height: 44, borderRadius: 22, border: 'none', cursor: 'pointer', flexShrink: 0, color: colors.white, background: listening ? '#DC2626' : `linear-gradient(135deg, ${gradients.primary.join(', ')})`, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canListen() ? 1 : 0.4, boxShadow: listening ? '0 0 0 6px #DC262626' : shadows.sm }}
            >
              {listening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={listening ? 'Listening…' : 'Type or tap the mic…'} aria-label="Message"
              style={{ flex: 1, minWidth: 0, height: 40, borderRadius: radii.pill, border: `1px solid ${colors.border}`, padding: '0 14px', fontSize: 13.5, fontFamily: fonts.sansRegular, color: colors.ink }} />
            <button type="submit" disabled={!draft.trim() || (!!busy && !pending)} aria-label="Send"
              style={{ width: 40, height: 40, borderRadius: 20, border: 'none', cursor: 'pointer', background: colors.rust, color: colors.white, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: draft.trim() ? 1 : 0.45 }}>
              <Send size={16} />
            </button>
          </form>
          <style jsx global>{`
            .assistant-spin { animation: assistant-spin 0.9s linear infinite; }
            @keyframes assistant-spin { to { transform: rotate(360deg); } }
          `}</style>
        </section>
      )}
    </>
  );
}

function Bubble({ who, text, faded }: { who: 'you' | 'bot'; text: string; faded?: boolean }) {
  const mine = who === 'you';
  return (
    <p style={{ margin: 0, maxWidth: '85%', alignSelf: mine ? 'flex-end' : 'flex-start', padding: '8px 12px', borderRadius: 14, borderBottomRightRadius: mine ? 4 : 14, borderBottomLeftRadius: mine ? 14 : 4, backgroundColor: mine ? colors.rust : colors.white, color: mine ? colors.white : colors.ink, border: mine ? 'none' : `1px solid ${colors.border}`, fontSize: 13.5, lineHeight: 1.45, opacity: faded ? 0.6 : 1, whiteSpace: 'pre-wrap' }}>
      {text}
    </p>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} style={{ width: 30, height: 30, borderRadius: radii.md, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </button>
  );
}
