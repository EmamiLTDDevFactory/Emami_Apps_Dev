// Mixes and encodes the tutorial recorded by record.mjs: each narration clip is delayed to its step (adelay), mixed
// (amix + limiter) onto video.webm, encoded H.264 CRF 30 + AAC 96k mono with faststart, and the captions / chapters
// are written from timings.json. Usage: node mix.mjs <record-out-dir> <ffmpeg> [<public/tutorial dir>]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [DIR, FFMPEG, DEST = DIR] = process.argv.slice(2);
const LEAD = 0.25; // narration starts just after the step's caption appears

const timings = JSON.parse(fs.readFileSync(path.join(DIR, 'timings.json'), 'utf8'));
const said = timings.filter((t) => t.text);
const chapters = timings.filter((t) => t.chapter);
const end = said[said.length - 1].end;

const args = ['-loglevel', 'error', '-y', '-i', path.join(DIR, 'video.webm')];
for (const s of said) args.push('-i', s.audio);
const delays = said.map((s, i) => `[${i + 1}:a]aresample=44100,adelay=${Math.round((s.at + LEAD) * 1000)}:all=1[a${i}]`);
const mix = `${said.map((_, i) => `[a${i}]`).join('')}amix=inputs=${said.length}:normalize=0,volume=1.15,alimiter=limit=0.89:level=disabled[aout]`;
args.push('-filter_complex', `${delays.join(';')};${mix}`, '-map', '0:v', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '30', '-pix_fmt', 'yuv420p', '-r', '25',
  '-c:a', 'aac', '-b:a', '96k', '-ac', '1', '-movflags', '+faststart', path.join(DEST, 'bom-simulator-tutorial.mp4'));
execFileSync(FFMPEG, args, { stdio: 'inherit' });

const ts = (sec) => { const ms = Math.round(sec * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; };
const cues = said.map((s, i) => `${i + 1}\n${ts(s.at + LEAD)} --> ${ts((said[i + 1]?.at ?? s.end) - 0.1)}\n${s.text}\n`);
fs.writeFileSync(path.join(DEST, 'bom-simulator-tutorial.vtt'), `WEBVTT\n\n${cues.join('\n')}`);
fs.writeFileSync(path.join(DEST, 'chapters.vtt'), `WEBVTT\n\n${chapters.map((c, i) => `${ts(c.at)} --> ${ts(chapters[i + 1]?.at ?? end)}\n${c.chapter}\n`).join('\n')}`);
fs.writeFileSync(path.join(DEST, 'chapters.json'), JSON.stringify(chapters.map((c) => ({ title: c.chapter.replace(/^\d+\.\s*/, ''), start: Math.round(c.at * 10) / 10 })), null, 1));
console.log(`${said.length} clips, ${chapters.length} chapters, ${end.toFixed(0)} s ->`, DEST);
