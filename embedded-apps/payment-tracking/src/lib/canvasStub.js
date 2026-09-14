// Stub for Metro's resolver — pdfjs-dist's legacy build conditionally `require("canvas")` as a
// Node-side DOMMatrix polyfill it never actually calls in a real browser (which already provides
// DOMMatrix natively); Metro can't see through that try/catch and fails to bundle without this.
module.exports = {};
