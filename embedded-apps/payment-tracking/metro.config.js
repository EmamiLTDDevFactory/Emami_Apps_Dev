// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// See src/lib/canvasStub.js — pdfjs-dist's legacy build (used for the invoice-attachment
// compression pipeline, web only) requires "canvas" as a Node-only DOMMatrix polyfill fallback
// that a real browser never needs; Metro fails to resolve it without this stub.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  canvas: require.resolve('./src/lib/canvasStub.js'),
};

module.exports = config;
