const HOSTNAME = window.location.hostname;

// Local dev servers (localhost / 127.0.0.1) must never bounce out to the real
// Emami Apps hub — there's nothing there for a locally-run app to exchange a
// session with. Only genuinely deployed dev/prod hostnames redirect, and each
// one only ever goes to its own environment.
export const IS_LOCAL_HOST =
    HOSTNAME === "localhost" || HOSTNAME === "127.0.0.1";

export const EMAMI_APPS_URL = HOSTNAME.includes("dev")
    ? "https://dev.emamiapps.in/"
    : "https://www.emamiapps.in/";
