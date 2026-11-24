/*
  Costing Cockpit AI proxy (Groq / Groq). The Cockpit is a static site, so a SHARED key cannot live in the browser: when GROQ_API_KEY is set here the
  browser calls this route (NEXT_PUBLIC_AI_BASE_URL = <api>/me/cockpit-ai, NEXT_PUBLIC_AI_SERVER_KEY=true) and nobody types a key.

    POST /api/me/cockpit-ai/chat/completions   OpenAI compatible body (also streaming); forwarded to Groq with the server key

  Access: a valid hub session AND the Costing Cockpit grant. The model must be on AI_MODELS_ALLOWED (comma list, default llama-3.3-70b-versatile,llama-3.1-8b-instant,qwen/qwen3-32b,openai/gpt-oss-120b,openai/gpt-oss-20b).
  The body is limited (AI_MAX_BODY_KB, default 256), the number of messages and max_tokens are capped, every call is counted per user and minute
  (AI_RATE_PER_MIN, default 20) and logged without the prompt text (user, model, ms, status, token counts). READ-ONLY by design: the proxy forwards chat
  requests only; nothing here (or in the Cockpit AI code) can write to SAP.
  Env: GROQ_API_KEY, GROQ_BASE_URL (default https://api.groq.com/openai/v1).
*/
const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { JWT_SECRET } = require('./sessionAuth');

const APP_ID = 'bom-cost-explorer';
const BASE = (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
const ALLOWED = (process.env.AI_MODELS_ALLOWED || 'llama-3.3-70b-versatile,llama-3.1-8b-instant,qwen/qwen3-32b,openai/gpt-oss-120b,openai/gpt-oss-20b').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_BODY_KB = Number(process.env.AI_MAX_BODY_KB || 256);
const MAX_MESSAGES = 60;
const MAX_TOKENS = 8000;
const PER_MIN = Number(process.env.AI_RATE_PER_MIN || 20);

const router = express.Router();
const calls = new Map();

function verifiedEmail(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.get('authorization') || '');
    if (!m || !JWT_SECRET) return '';
    try { const p = jwt.verify(m[1].trim(), JWT_SECRET, { algorithms: ['HS256'] }); return p && !p.purpose ? String(p.email || '').trim().toLowerCase() : ''; } catch { return ''; }
}
async function requireUser(req, res, next) {
    const email = verifiedEmail(req);
    if (!email) return res.status(401).json({ error: { message: 'Your Emami Apps session has expired or is missing. Please sign in again.' } });
    try {
        const [grant, user] = await Promise.all([
            pool.query('SELECT role FROM emami_apps.authorized_user_apps WHERE email = $1 AND app_id = $2', [email, APP_ID]),
            pool.query('SELECT is_active FROM emami_apps.authorized_users WHERE email = $1', [email]),
        ]);
        if (!grant.rows.length || user.rows[0]?.is_active === false) return res.status(403).json({ error: { message: 'You do not have access to the Costing Cockpit.' } });
        req.email = email;
        next();
    } catch (e) {
        console.error('[cockpit-ai]', e.message);
        res.status(500).json({ error: { message: 'Could not verify your access.' } });
    }
}
function limited(email, now = Date.now()) {
    const list = (calls.get(email) || []).filter((t) => now - t < 60000);
    list.push(now); calls.set(email, list);
    return list.length > PER_MIN;
}

router.use(requireUser);
router.use(express.json({ limit: `${MAX_BODY_KB}kb` }));

router.post('/chat/completions', async (req, res) => {
    const key = process.env.GROQ_API_KEY;
    if (!key) return res.status(503).json({ error: { message: 'The AI service is not configured on the server.' } });
    const b = req.body || {};
    if (!ALLOWED.includes(String(b.model))) return res.status(400).json({ error: { message: `Model not allowed. Use one of: ${ALLOWED.join(', ')}.` } });
    if (!Array.isArray(b.messages) || !b.messages.length || b.messages.length > MAX_MESSAGES) return res.status(400).json({ error: { message: 'Bad messages.' } });
    if (limited(req.email)) return res.status(429).json({ error: { message: `Limit of ${PER_MIN} AI requests a minute reached.` } });
    const body = { model: b.model, messages: b.messages, max_tokens: Math.min(Number(b.max_tokens) || 4000, MAX_TOKENS), temperature: typeof b.temperature === 'number' ? b.temperature : 0.2, stream: !!b.stream,
        ...(Array.isArray(b.tools) && b.tools.length ? { tools: b.tools.slice(0, 40), tool_choice: 'auto' } : {}) };
    const t0 = Date.now();
    try {
        const r = await fetch(`${BASE}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
        res.status(r.status);
        res.set('Content-Type', r.headers.get('content-type') || 'application/json');
        if (b.stream && r.body) {
            const reader = r.body.getReader();
            for (;;) { const { value, done } = await reader.read(); if (done) break; res.write(Buffer.from(value)); }
            res.end();
        } else {
            const text = await r.text();
            try { const u = JSON.parse(text)?.usage; console.log(`[cockpit-ai] ${req.email} ${b.model} ${r.status} ${Date.now() - t0}ms in=${u?.prompt_tokens ?? '-'} out=${u?.completion_tokens ?? '-'}`); } catch { /* not json */ }
            res.send(text);
        }
        if (b.stream) console.log(`[cockpit-ai] ${req.email} ${b.model} ${r.status} ${Date.now() - t0}ms stream`);
    } catch (e) {
        console.error('[cockpit-ai]', e.message);
        if (!res.headersSent) res.status(502).json({ error: { message: 'The AI service could not be reached.' } }); else res.end();
    }
});

module.exports = router;
module.exports.__test = { verifiedEmail, limited };
