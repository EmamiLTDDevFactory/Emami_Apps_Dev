// Browser speech for the assistant: Web Speech API recognition (Chrome / Edge; Safari and Firefox can't listen) and
// speechSynthesis for the reply. Nothing is recorded or sent anywhere except by the browser's own speech service.

export type VoiceLang = 'en-IN' | 'hi-IN' | 'bn-IN';

export const VOICE_LANGS: { lang: VoiceLang; label: string; short: string }[] = [
  { lang: 'en-IN', label: 'English', short: 'EN' },
  { lang: 'hi-IN', label: 'हिन्दी', short: 'हि' },
  { lang: 'bn-IN', label: 'বাংলা', short: 'বা' },
];

// Not in TypeScript's DOM lib.
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

const ctor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const canListen = () => !!ctor();

/** Listens for one utterance. `onText` gets the running transcript; resolves with the final text ('' if nothing). */
export function listenOnce(lang: VoiceLang, onText: (t: string) => void): { done: Promise<string>; stop: () => void } {
  const C = ctor();
  if (!C) return { done: Promise.reject(new Error('This browser cannot listen. Use Chrome or Edge, or type instead.')), stop: () => {} };
  const rec = new C();
  rec.lang = lang;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let finalText = '';
  let interim = '';
  const done = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      reject(new Error(e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in the browser and try again.' : `Speech recognition failed (${e.error}).`));
    };
    rec.onend = () => resolve((finalText || interim).trim());
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}

/** The language a reply is written in, from its script. */
export function langOfText(text: string): VoiceLang {
  const bn = (text.match(/[ঀ-৿]/g) ?? []).length;
  const hi = (text.match(/[ऀ-ॿ]/g) ?? []).length;
  if (bn > hi && bn > 0) return 'bn-IN';
  if (hi > 0) return 'hi-IN';
  return 'en-IN';
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Reads text aloud in its own language when the device has such a voice; silently skips when it has none. */
export function speak(text: string): void {
  if (!canSpeak() || !text) return;
  const lang = langOfText(text);
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2);
  const voice = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.replace('_', '-').startsWith(base));
  if (!voice && lang !== 'en-IN') return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

export const stopSpeaking = () => {
  if (canSpeak()) window.speechSynthesis.cancel();
};

/** A spoken/typed answer to a confirm question: true = yes, false = no, null = neither. */
export function yesNo(text: string): boolean | null {
  const t = text.toLowerCase().trim();
  if (/^(yes|yeah|yep|ok|okay|sure|confirm|do it|go ahead|haan|haa|ha|ji|ji haan|theek hai|thik hai|ঠিক আছে|হ্যাঁ|হ্যা|হাঁ|হা|করো|হ্যাঁ করো|हाँ|हां|हा|जी|ठीक है|कर दो)\b/.test(t) || /^(হ্যাঁ|হ্যা|হাঁ|ঠিক আছে|हाँ|हां|ठीक है|जी)/.test(t)) return true;
  if (/^(no|nope|cancel|stop|don't|dont|nahi|na|naa|mat|না|নাহ|থাক|बाद में|नहीं|ना|मत)\b/.test(t) || /^(না|থাক|नहीं|ना)/.test(t)) return false;
  return null;
}
