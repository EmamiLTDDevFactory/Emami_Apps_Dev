'use strict';
/*
   Local stand-in for the Anthropic Messages API, for testing Setu's AI insights without a key or any cost.
   It checks every request Setu sends and answers with JSON in the requested schema.

     node backend/setu/tests/mock-anthropic.js [port=4199] [mode=ok|refusal|error]
   then start the backend with  ANTHROPIC_API_KEY=test-key  ANTHROPIC_BASE_URL=http://localhost:4199

   GET /_requests returns what was received (with any problems found), for the test to assert on.
*/
const http = require('http');

const port = Number(process.argv[2] || 4199);
const mode = process.argv[3] || 'ok';
const received = [];

function problemsIn(req, body) {
    const p = [];
    if (req.headers['x-api-key'] !== 'test-key') p.push('missing / wrong x-api-key');
    if (!String(req.headers['anthropic-beta'] || '').includes('server-side-fallback-2026-07-01')) p.push('fallback beta header missing');
    if (body.model !== 'claude-opus-5-5') p.push(`unexpected model ${body.model}`);
    if (body.fallbacks !== 'default') p.push('fallbacks: "default" missing');
    if (body.output_config?.format?.type !== 'json_schema' || typeof body.output_config.format.schema !== 'object') p.push('output_config.format json_schema missing');
    if (body.output_config?.format?.schema?.additionalProperties !== false) p.push('schema must set additionalProperties: false');
    if (!body.cache_control || body.cache_control.type !== 'ephemeral') p.push('prompt caching (cache_control) missing');
    if ('thinking' in body && body.thinking?.type !== 'adaptive') p.push('thinking must be omitted or adaptive');
    if ('temperature' in body || 'top_p' in body) p.push('sampling params are not accepted by this model');
    const user = JSON.stringify(body.messages || []);
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(user)) p.push('an email address reached the model');
    if (/\d{10}/.test(user.replace(/"(at|generatedAt)":"[^"]*"/g, ''))) p.push('a 10-digit number (phone) reached the model');
    return p;
}

function answerFor(body) {
    const schema = body.output_config.format.schema;
    if (schema.required.includes('suggestedReply')) {
        const m = /^- ([^:\n]+): ([^|\n]+)/m.exec(body.system || '');
        return {
            summary: 'Distributor cannot sign in to the sales app since this morning; orders are blocked.',
            sentiment: 'frustrated',
            suggestedCategory: m ? m[1].trim() : '',
            suggestedFunction: m ? m[2].trim() : '',
            categoryConfidence: 'high',
            likelyRootCause: 'The user ID was locked after repeated wrong password attempts.',
            actionPoints: [
                { action: 'Unlock the user ID and reset the password.', owner: 'agent', priority: 'now' },
                { action: 'Confirm with the distributor that orders sync after login.', owner: 'agent', priority: 'today' },
            ],
            suggestedReply: 'Dear Sir,\n\nWe have unlocked your user ID and reset the password. Please sign in again and let us know if orders still do not sync.',
            missingInformation: [],
            // Not in the schema - must be ignored / not break anything:
        };
    }
    return {
        headline: 'Backlog is high and sync issues dominate this week.',
        themes: [{ title: 'Sync failures', detail: 'Most new tickets are device sync problems.' }],
        risks: [{ title: 'SLA breaches', detail: 'Overdue tickets will keep rising without more agents available.', severity: 'high' }],
        actionPoints: [{ action: 'Move two agents to the sync queue today.', owner: 'supervisor', priority: 'now', why: 'Sync is the largest category.' }],
    };
}

http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/_requests') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify(received));
    }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
        let body = {};
        try { body = JSON.parse(raw || '{}'); } catch { /* recorded below */ }
        const problems = req.url.startsWith('/v1/messages') ? problemsIn(req, body) : [`unexpected path ${req.url}`];
        received.push({ path: req.url, problems, kind: body.output_config?.format?.schema?.required?.includes('suggestedReply') ? 'ticket' : 'dashboard' });
        if (mode === 'error') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'mock failure' } })); }
        const refusal = mode === 'refusal';
        const msg = {
            id: `msg_mock_${received.length}`, type: 'message', role: 'assistant', model: body.model,
            content: refusal ? [] : [{ type: 'text', text: JSON.stringify(answerFor(body)) }],
            stop_reason: refusal ? 'refusal' : 'end_turn', stop_sequence: null,
            stop_details: refusal ? { type: 'refusal', category: null, explanation: 'mock refusal' } : null,
            usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        };
        res.writeHead(200, { 'content-type': 'application/json', 'request-id': `req_mock_${received.length}` });
        res.end(JSON.stringify(msg));
    });
}).listen(port, () => console.log(`mock Anthropic API on http://localhost:${port} (${mode})`));
