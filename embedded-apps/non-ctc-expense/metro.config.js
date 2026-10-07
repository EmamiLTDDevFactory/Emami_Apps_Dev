// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// pdfjs-dist's "legacy" build (used for compressing a large PDF attachment — see
// src/lib/pdfAttachment.ts) has a `require('canvas')` for its Node.js-side rendering fallback,
// which this app never uses (compression only ever runs in a real browser, with the browser's own
// native Canvas). That require is still present in the bundled code regardless, so Metro tries to
// resolve it ahead of time and fails, since the `canvas` package's native binding isn't built —
// same well-known pdfjs-dist + bundler issue every other bundler ecosystem (webpack, Vite) needs
// this exact kind of resolver override for. Pointing it at Metro's own empty-module shim is a
// no-op for every other import in the app; it only ever matters for this one unused code path.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'canvas') {
    return {
      type: 'empty',
    };
  }
  return originalResolveRequest
    ? originalResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
