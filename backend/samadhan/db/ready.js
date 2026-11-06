'use strict';
const { initSchema } = require('./schema');

/** Resolves once the Samadhan schema exists. Every request awaits it, so the first request after a cold start
 *  never races table creation. */
const ready = initSchema().catch((err) => {
    console.error('[samadhan] schema init failed:', err.message);
    throw err;
});
ready.catch(() => {});

module.exports = { ready };
