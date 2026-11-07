'use strict';
const crypto = require('crypto');
const { WHATSAPP } = require('../constants');

// ---------- WhatsApp Business (Meta WhatsApp Cloud API) ----------
// Inbound: Meta calls POST /api/samadhan/whatsapp/webhook, signed with the app secret (whatsappIngest.js turns the
// messages into tickets). Outbound: an agent's reply on a WhatsApp ticket goes back as a WhatsApp text message.
// Off unless SAMADHAN_WHATSAPP_ENABLED=true and all four keys are set; while off, replies are saved on the ticket only.

const whatsappReady = () => WHATSAPP.enabled && Boolean(WHATSAPP.token && WHATSAPP.phoneNumberId && WHATSAPP.appSecret && WHATSAPP.verifyToken);

/** X-Hub-Signature-256 is "sha256=" + HMAC-SHA256 of the raw request body with the app secret. */
function validSignature(rawBody, header) {
    if (!rawBody || !WHATSAPP.appSecret) return false;
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', WHATSAPP.appSecret).update(rawBody).digest('hex')}`);
    const given = Buffer.from(String(header || ''));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** WhatsApp ids are the number with country code ("919830012345"); Samadhan stores "+919830012345". */
const toE164 = (waId) => `+${String(waId).replace(/\D/g, '')}`;

/** Text of one inbound message. Media is not downloaded: a placeholder (with the caption) says what arrived. */
function messageText(m) {
    switch (m.type) {
        case 'text': return m.text?.body ?? '';
        case 'button': return m.button?.text ?? '';
        case 'interactive': return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '';
        case 'image': case 'video': case 'document': case 'audio': case 'sticker': {
            const media = m[m.type] ?? {};
            return `[${m.type}${media.filename ? `: ${media.filename}` : ''} received on WhatsApp - open WhatsApp Business to view it]${media.caption ? `\n${media.caption}` : ''}`;
        }
        case 'location': return `[location] ${m.location?.name ?? ''} ${m.location?.latitude ?? ''},${m.location?.longitude ?? ''}`.trim();
        default: return `[${m.type} message]`;
    }
}

/** Messages in a webhook payload as [{ id, from, name, text, at }]. Delivery and read receipts are ignored. */
function inboundMessages(payload) {
    const out = [];
    for (const entry of payload?.entry ?? []) {
        for (const change of entry.changes ?? []) {
            if (change.field !== 'messages') continue;
            const v = change.value ?? {};
            const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
            for (const m of v.messages ?? []) {
                if (!m.id || !m.from) continue;
                out.push({
                    id: String(m.id).slice(0, 200),
                    from: toE164(m.from),
                    name: String(names[m.from] || toE164(m.from)).slice(0, 200),
                    text: messageText(m).slice(0, 5000),
                    at: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
                });
            }
        }
    }
    return out;
}

/** Reply HTML as WhatsApp text: line breaks kept, tags dropped, the common entities decoded. */
function htmlToWhatsAppText(html) {
    return String(html ?? '')
        .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * The webhook body exactly as Meta signed it. The shared backend's JSON parser has already read the request (and
 * Samadhan does not change the shared server), so the body is re-serialised the way Meta writes it: compact JSON with
 * "/" and every non-ASCII character escaped (é, emoji as surrogate pairs).
 */
function metaJson(body) {
    return JSON.stringify(body)
        .replace(/\//g, '\\/')
        .replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** Sends a text message. Never throws: returns { sent } or { sent: false, reason } for the activity log. */
async function sendWhatsApp(to, text) {
    if (!whatsappReady()) return { sent: false, reason: 'WhatsApp is switched off on the server' };
    try {
        const res = await fetch(`https://graph.facebook.com/${WHATSAPP.apiVersion}/${WHATSAPP.phoneNumberId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${WHATSAPP.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messaging_product: 'whatsapp', recipient_type: 'individual', to: String(to).replace(/\D/g, ''),
                type: 'text', text: { preview_url: false, body: String(text).slice(0, 4096) },
            }),
        });
        if (res.ok) return { sent: true };
        const err = await res.json().catch(() => ({}));
        const code = err?.error?.code;
        // 131047: the requester last wrote more than 24 hours ago - WhatsApp then accepts approved templates only.
        const reason = code === 131047 ? 'more than 24 hours since the requester last wrote on WhatsApp' : `WhatsApp refused the message (${code ?? res.status})`;
        console.error('[samadhan] whatsapp send failed:', reason);
        return { sent: false, reason };
    } catch (err) {
        console.error('[samadhan] whatsapp send failed:', err.message);
        return { sent: false, reason: 'WhatsApp could not be reached' };
    }
}

module.exports = { htmlToWhatsAppText, inboundMessages, messageText, metaJson, sendWhatsApp, toE164, validSignature, whatsappReady };
