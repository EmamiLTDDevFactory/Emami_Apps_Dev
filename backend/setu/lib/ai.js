'use strict';

/*
   Claude for Setu's insights (lib/insights.js). Optional: without ANTHROPIC_API_KEY (the same key the rest of the
   backend uses) - or with SETU_AI_ENABLED=false - every insight falls back to the built-in rules, so Setu works
   the same, just without the AI wording.

   - Structured output: the answer is constrained to a JSON schema (output_config.format), so it is always parseable.
   - Server-side fallback ("default"): if the model declines a request, the API retries it on a fallback model in
     the same call; a decline from the whole chain comes back as stop_reason "refusal" and is reported, not shown.
   - Prompt caching: the stable system prompt (instructions + Category -> Function list) is cached between calls.
   - Privacy: email addresses and phone numbers are replaced before any text leaves Emami (redact below).
*/

// The SDK is loaded on first use, never at backend start: Setu's AI can not stop the shared backend (and every
// other app on it) from starting, whatever happens to this package.
let Anthropic = null;
function sdk() {
    if (!Anthropic) {
        const m = require('@anthropic-ai/sdk');
        Anthropic = m.Anthropic || m.default || m;
    }
    return Anthropic;
}
const MODEL = 'claude-opus-5-5';
const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY) && String(process.env.SETU_AI_ENABLED || 'true').toLowerCase() !== 'false';

let client = null;
function getClient() {
    if (!client) client = new (sdk())({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 90_000 });
    return client;
}

class AiUnavailable extends Error {}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
/** Replaces email addresses and phone numbers, and trims, before text is sent to the model. */
const redact = (text, max = 2000) => String(text ?? '')
    .replace(EMAIL_RE, '[email]')
    .replace(PHONE_RE, '[phone]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

/**
 * One structured request. `system` is the stable prefix (cached); `user` carries the case data.
 * Returns the parsed JSON object that matches `schema`.
 */
async function structured({ system, user, schema, effort = 'medium' }) {
    if (!aiEnabled()) throw new AiUnavailable('AI is not configured on the server.');
    let Sdk;
    try {
        Sdk = sdk();
    } catch {
        throw new AiUnavailable('The AI library is not installed on the server.');
    }
    let response;
    try {
        response = await getClient().beta.messages.create({
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            cache_control: { type: 'ephemeral' },
            output_config: { effort, format: { type: 'json_schema', schema } },
            system,
            messages: [{ role: 'user', content: user }],
        });
    } catch (err) {
        if (err instanceof Sdk.AuthenticationError || err instanceof Sdk.PermissionDeniedError) {
            throw new AiUnavailable('The AI service rejected the server\'s API key.');
        }
        if (err instanceof Sdk.RateLimitError) throw new AiUnavailable('The AI service is busy. Try again in a minute.');
        if (err instanceof Sdk.APIConnectionError) throw new AiUnavailable('Could not reach the AI service.');
        if (err instanceof Sdk.APIError) throw new AiUnavailable(`The AI service returned an error (${err.status ?? 'unknown'}).`);
        throw err;
    }
    if (response.stop_reason === 'refusal') throw new AiUnavailable('The AI declined to analyse this content.');
    if (response.stop_reason === 'max_tokens') throw new AiUnavailable('The AI answer was cut short.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    try {
        return JSON.parse(text);
    } catch {
        throw new AiUnavailable('The AI answer could not be read.');
    }
}

module.exports = { AiUnavailable, MODEL, aiEnabled, redact, structured };
