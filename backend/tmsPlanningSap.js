/*
   Reader for the Dp* entity sets of ZTMS_SRV (Distribution Planning). Same transport as tmsSap.js (url/headers come from there), plus paging.
   Every Dp set requires a filter; a set that ignores $skip would repeat the first page forever, so a repeated first key stops the loop.
*/
const sap = require('./tmsSap');
const PAGE = 20000, MAX_PAGES = 40;

function makeFetchSet() {
    const f = async (caller, set, filter) => {
        if (!sap.isConfigured()) throw new sap.SapError('The SAP connection for Trip Trail is not configured (TMS_SAP_ODATA_BASE).', 503);
        const rows = []; let prevFirst = null;
        for (let page = 0; page < MAX_PAGES; page++) {
            const q = `${set}?$format=json&$top=${PAGE}${page ? `&$skip=${page * PAGE}` : ''}&$filter=${encodeURIComponent(filter)}`;
            let res;
            try { res = await fetch(sap._test.url(q, caller), { headers: sap._test.headersFor(caller), cache: 'no-store' }); } catch (e) { throw new sap.SapError(`SAP is not reachable: ${e.message}`); }
            const text = await res.text(); let json = {}; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 200) }; }
            if (!res.ok) { const m = sap.mapError(json, res.status); throw new sap.SapError(`${set}: ${m.message}`, m.status); }
            const part = (json.d && (json.d.results || (Array.isArray(json.d) ? json.d : null))) || [];
            const first = part.length ? JSON.stringify(part[0]) : null;
            if (page && first && first === prevFirst) break;
            prevFirst = first; rows.push(...part);
            if (part.length < PAGE) break;
        }
        return rows;
    };
    f.live = sap.isConfigured();
    return f;
}
module.exports = { makeFetchSet };
