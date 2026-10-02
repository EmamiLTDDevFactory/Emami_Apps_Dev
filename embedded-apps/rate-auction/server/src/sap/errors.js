// One error type for every SAP problem, so routes can decide what to show and whether to retry.
export class SapError extends Error {
  constructor(message, { status = 0, retryable = false, unknownOutcome = false, detail = null } = {}) {
    super(message);
    this.name = 'SapError';
    this.status = status;
    this.retryable = retryable;
    // true when a write may or may not have reached SAP (timeout / dropped connection).
    // Never retry blindly: check SAP first (see guide, reliability section).
    this.unknownOutcome = unknownOutcome;
    this.detail = detail;
  }
}

// SAP Gateway error body: { error: { message: { value }, innererror: { errordetails: [{message}] } } }
export function messageFromSapBody(body) {
  const e = body && body.error;
  if (!e) return null;
  const main = e.message && (e.message.value || e.message);
  const more = (e.innererror?.errordetails || []).map((x) => x.message).filter((m) => m && m !== main);
  return [main, ...more.slice(0, 3)].filter(Boolean).join(' | ');
}
