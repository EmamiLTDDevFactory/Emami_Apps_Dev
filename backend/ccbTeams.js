/**
 * Microsoft Teams meetings for CCB meetings (Change Control, changeControl.js).
 *
 * Scheduling a CCB meeting in the app creates an Outlook calendar event with a Teams meeting in the organiser's
 * calendar (the person who scheduled it, or CCB_TEAMS_ORGANIZER when set) and invites the CCB members, secretary
 * and IT Application Head. Graph, app-only (client credentials, the same app registration as orgProfile.js):
 *
 *   POST   /users/{organiser}/events                      { subject, start, end, attendees, isOnlineMeeting: true,
 *                                                          onlineMeetingProvider: 'teamsForBusiness', ... }
 *   PATCH  /users/{organiser}/events/{id}                 reschedule / rename / venue / attendees
 *   POST   /users/{organiser}/events/{id}/cancel          cancellation notice to every attendee
 *
 * Needs the APPLICATION permission Calendars.ReadWrite (admin consent) on the app registration; best scoped to the
 * CCB organisers with an Exchange application access policy. Without it Graph answers 403 and the meeting is still
 * scheduled in the app exactly as before - the error is stored on the meeting ("teamsStatus" = 'failed') and the
 * secretary can retry from the meeting page. Nothing here ever throws into a CCB route.
 *
 * Env: GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET (shared with orgProfile.js), CCB_TEAMS_ENABLED
 * ('false' turns the integration off), CCB_TEAMS_ORGANIZER (optional fixed organiser mailbox), HUB_AUTH_FRONTEND_URL
 * (links back to the meeting page in the invitation).
 */
const TENANT_ID = process.env.GRAPH_TENANT_ID || '0b5a98ee-ffb0-4615-b6c7-17efc911d396';
const CLIENT_ID = process.env.GRAPH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET || '';
const ENABLED = String(process.env.CCB_TEAMS_ENABLED || 'true').toLowerCase() !== 'false';
const FIXED_ORGANIZER = String(process.env.CCB_TEAMS_ORGANIZER || '').trim().toLowerCase();
const APP_URL = (process.env.HUB_AUTH_FRONTEND_URL || 'https://www.emamiapps.in').split(',')[0].trim().replace(/\/+$/, '');
const GRAPH = 'https://graph.microsoft.com/v1.0';
const TIME_ZONE = 'India Standard Time';
const TIMEOUT_MS = 20_000;
const EMAIL_RE = /^[^\s@']+@[^\s@']+\.[^\s@']+$/;

const configured = () => ENABLED && Boolean(CLIENT_ID && CLIENT_SECRET);

let token = { value: '', expiresAt: 0 };
async function graphToken() {
    if (token.value && Date.now() < token.expiresAt - 60_000) return token.value;
    const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(`Microsoft sign-in for the app failed (${res.status} ${data.error || ''})`.trim());
    token = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return token.value;
}

async function graph(method, path, body) {
    const res = await fetch(`${GRAPH}${path}`, {
        method,
        headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json', Prefer: `outlook.timezone="${TIME_ZONE}"` },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 202 || res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const code = data?.error?.code || '';
        const err = new Error(explain(res.status, code, data?.error?.message || ''));
        err.status = res.status;
        throw err;
    }
    return data;
}

/** Graph errors in words for the CCB Secretary / IT. */
function explain(status, code, message) {
    if (status === 403 || code === 'ErrorAccessDenied' || /Access is denied/i.test(message)) {
        return 'Microsoft 365 refused to create the Teams meeting: the Emami Apps app registration needs the Calendars.ReadWrite application permission (admin consent) in Entra ID.';
    }
    if (status === 404 || code === 'ErrorInvalidUser' || code === 'MailboxNotEnabledForRESTAPI' || code === 'ResourceNotFound') {
        return 'The organiser has no Exchange Online mailbox, so Teams could not create the meeting in their calendar.';
    }
    return `Microsoft Graph ${status}${code ? ` ${code}` : ''}: ${message || 'request failed'}`.slice(0, 500);
}

/** "2026-10-16T15:00:00" in IST for a JS date (Graph reads it with timeZone 'India Standard Time'). */
function istLocal(d) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
        .formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const meetingUrl = (id) => `${APP_URL}/apps/dev-tracker/ccb/meetings/?id=${id}`;

/** The invitation body: agenda (CR numbers and titles) and a link to the meeting page in Emami Apps. */
function invitationHtml(m, agenda = []) {
    const items = agenda.length
        ? `<ol>${agenda.map((a) => `<li><b>${esc(a.crNo)}</b> &mdash; ${esc(a.title)}${a.kind === 'ratification' ? ' <i>(ratification)</i>' : ''}</li>`).join('')}</ol>`
        : '<p>The agenda is built from the requests awaiting the board; see the meeting page.</p>';
    return `<p><b>${esc(m.title)}</b> (${esc(m.meetingNo)}) &mdash; Change Control Board${m.isEmergency ? ', emergency meeting' : ''}.</p>`
        + `<p>Agenda:</p>${items}`
        + `<p>Meeting page, agenda and decisions: <a href="${esc(meetingUrl(m.id))}">${esc(meetingUrl(m.id))}</a></p>`
        + (m.venue && !/^https?:\/\//i.test(m.venue) ? `<p>Venue: ${esc(m.venue)}</p>` : '')
        + '<p style="color:#666;font-size:12px">Scheduled from Emami Apps &middot; Change Control. Changes to the meeting are made in the app.</p>';
}

function eventBody(m, attendees = [], agenda = []) {
    const start = new Date(m.scheduledAt);
    const end = new Date(start.getTime() + (Number(m.durationMin) || 60) * 60_000);
    const online = m.mode !== 'offline';
    return {
        subject: `${m.title} (${m.meetingNo})`,
        body: { contentType: 'HTML', content: invitationHtml(m, agenda) },
        start: { dateTime: istLocal(start), timeZone: TIME_ZONE },
        end: { dateTime: istLocal(end), timeZone: TIME_ZONE },
        location: { displayName: m.venue && !/^https?:\/\//i.test(m.venue) ? m.venue : online ? 'Microsoft Teams Meeting' : '' },
        attendees: attendees.map((email) => ({ emailAddress: { address: email }, type: 'required' })),
        importance: m.isEmergency ? 'high' : 'normal',
        allowNewTimeProposals: false,
        responseRequested: true,
        isOnlineMeeting: online,
        ...(online ? { onlineMeetingProvider: 'teamsForBusiness' } : {}),
        transactionId: `ccb-${m.meetingNo}`, // Graph de-duplicates a retried create with the same id
    };
}

const cleanEmails = (list, organizer) => [...new Set(list.map((e) => String(e || '').trim().toLowerCase()).filter((e) => EMAIL_RE.test(e) && e !== organizer))];

/** Create the Teams meeting. Returns { eventId, joinUrl, organizer } or throws (callers catch). */
async function createMeeting(m, { organizer, attendees, agenda }) {
    const org = FIXED_ORGANIZER || String(organizer || '').toLowerCase();
    if (!EMAIL_RE.test(org)) throw new Error('No organiser mailbox for the Teams meeting.');
    const path = `/users/${encodeURIComponent(org)}/events`;
    let ev = await graph('POST', path, eventBody(m, cleanEmails(attendees, org), agenda));
    // The join URL is sometimes filled a moment after the create.
    if (m.mode !== 'offline' && !ev?.onlineMeeting?.joinUrl && ev?.id) {
        await new Promise((r) => setTimeout(r, 2000));
        ev = (await graph('GET', `${path}/${encodeURIComponent(ev.id)}?$select=id,onlineMeeting,webLink`).catch(() => null)) || ev;
    }
    return { eventId: ev.id, joinUrl: ev?.onlineMeeting?.joinUrl || '', webLink: ev?.webLink || '', organizer: org };
}

/** Reschedule / rename / change venue or mode; the attendees get an updated invitation. */
async function updateMeeting(m, { attendees, agenda }) {
    const body = eventBody(m, cleanEmails(attendees, m.teamsOrganizer), agenda);
    delete body.transactionId;
    const ev = await graph('PATCH', `/users/${encodeURIComponent(m.teamsOrganizer)}/events/${encodeURIComponent(m.teamsEventId)}`, body);
    return { joinUrl: ev?.onlineMeeting?.joinUrl || m.teamsJoinUrl || '' };
}

/** Cancel: Outlook sends the cancellation with the reason to every attendee. */
async function cancelMeeting(m, note) {
    await graph('POST', `/users/${encodeURIComponent(m.teamsOrganizer)}/events/${encodeURIComponent(m.teamsEventId)}/cancel`, { comment: String(note || '').slice(0, 1000) });
}

// graphToken / APP_URL are also used by notifications.js for Outlook email (same app registration).
module.exports = { configured, createMeeting, updateMeeting, cancelMeeting, istLocal, eventBody, explain, graphToken, APP_URL };
