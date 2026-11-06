'use strict';

/*
   Attachment type check (master prompt §L): allow-list by extension AND by content ("sniffing" the first bytes), so a
   renamed .exe, a script or an HTML / SVG page is refused whatever it is called. Returns the content type we store and
   serve (never the one the browser sent).
*/

// extension -> { type, sniff }   sniff: 'zip' (Office / zip containers), 'ole' (old Office / .msg), 'pdf', 'png', 'jpg',
// 'gif', 'webp', 'bmp', 'heic', 'text' (must look like text: no NUL bytes, no HTML / script markers).
const ALLOWED = {
    png: { type: 'image/png', sniff: 'png' }, jpg: { type: 'image/jpeg', sniff: 'jpg' }, jpeg: { type: 'image/jpeg', sniff: 'jpg' },
    gif: { type: 'image/gif', sniff: 'gif' }, webp: { type: 'image/webp', sniff: 'webp' }, bmp: { type: 'image/bmp', sniff: 'bmp' },
    heic: { type: 'image/heic', sniff: 'heic' },
    pdf: { type: 'application/pdf', sniff: 'pdf' },
    txt: { type: 'text/plain', sniff: 'text' }, log: { type: 'text/plain', sniff: 'text' }, csv: { type: 'text/csv', sniff: 'text' },
    json: { type: 'application/json', sniff: 'text' }, xml: { type: 'application/xml', sniff: 'text' }, eml: { type: 'message/rfc822', sniff: 'text' },
    xlsx: { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sniff: 'zip' },
    docx: { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sniff: 'zip' },
    pptx: { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sniff: 'zip' },
    zip: { type: 'application/zip', sniff: 'zip' },
    xls: { type: 'application/vnd.ms-excel', sniff: 'ole' }, doc: { type: 'application/msword', sniff: 'ole' },
    ppt: { type: 'application/vnd.ms-powerpoint', sniff: 'ole' }, msg: { type: 'application/vnd.ms-outlook', sniff: 'ole' },
};
// Explicitly blocked (§L) - listed so the message can say why.
const BLOCKED = new Set(['exe', 'msi', 'bat', 'cmd', 'ps1', 'sh', 'js', 'vbs', 'jar', 'html', 'htm', 'svg', 'xlsm', 'docm', 'pptm', 'com', 'scr', 'dll', 'hta', 'lnk']);
const PREVIEW = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'application/pdf']);

const starts = (b, ...bytes) => bytes.every((x, i) => b[i] === x);
const MAGIC = {
    png: (b) => starts(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    jpg: (b) => starts(b, 0xff, 0xd8, 0xff),
    gif: (b) => b.subarray(0, 6).toString('latin1').startsWith('GIF8'),
    webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
    bmp: (b) => starts(b, 0x42, 0x4d),
    heic: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(b.subarray(8, 12).toString('latin1')),
    pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
    zip: (b) => starts(b, 0x50, 0x4b, 0x03, 0x04) || starts(b, 0x50, 0x4b, 0x05, 0x06),
    ole: (b) => starts(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
    text: (b) => {
        const head = b.subarray(0, 8192);
        if (head.includes(0)) return false;
        const s = head.toString('utf8').toLowerCase();
        return !/<\s*(script|html|iframe|svg|object|embed)\b/.test(s) && !s.startsWith('mz');
    },
};
// Office Open XML with macros carries vbaProject.bin; refuse it whatever the extension says.
const hasMacros = (b) => b.includes(Buffer.from('vbaProject.bin'));

/** Clean, safe file name (no path, no control characters, max 200 characters, extension kept). */
function cleanName(name) {
    const base = String(name || '').split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim() || 'file';
    if (base.length <= 200) return base;
    const dot = base.lastIndexOf('.');
    const ext = dot > 0 ? base.slice(dot) : '';
    return base.slice(0, 200 - ext.length) + ext;
}

/** { ok: true, type, ext, name, preview } or { ok: false, error } */
function checkFile(name, buffer) {
    const clean = cleanName(name);
    const ext = (clean.includes('.') ? clean.split('.').pop() : '').toLowerCase();
    if (BLOCKED.has(ext)) return { ok: false, error: `.${ext} files are not allowed (programs, scripts, web pages, SVG and macro files are blocked).` };
    const rule = ALLOWED[ext];
    if (!rule) return { ok: false, error: `.${ext || '(no extension)'} files are not allowed. Allowed: images, PDF, text / log / CSV, Office files, email (.msg / .eml), XML / JSON and ZIP.` };
    if (!buffer?.length) return { ok: false, error: 'The file is empty.' };
    if (!MAGIC[rule.sniff](buffer)) return { ok: false, error: `${clean} does not look like a real .${ext} file, so it was refused.` };
    if (rule.sniff === 'zip' && hasMacros(buffer)) return { ok: false, error: `${clean} contains macros, which are not allowed.` };
    return { ok: true, type: rule.type, ext, name: clean, preview: PREVIEW.has(rule.type) };
}

module.exports = { ALLOWED, BLOCKED, checkFile, cleanName };
