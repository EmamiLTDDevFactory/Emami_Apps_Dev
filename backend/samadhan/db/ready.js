'use strict';
const { initSchema } = require('./schema');

/** Resolves once the setu schema exists. Every request awaits it, so the first request after a cold start
 *  never races table creation. */
const ready = initSchema().catch((err) => {
    console.error('[setu] schema init failed:', err.message);
    throw err;
});
ready.catch(() => {});

module.exports = { ready };
