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

// .xlsx isn't one of Metro's default asset extensions (images/fonts only), so a plain require()
// of the Service PO Bulk Upload template would otherwise be parsed as source code and fail to
// bundle. Adding it here is what makes require('../assets/files/....xlsx') resolve to a servable
// asset URI instead.
config.resolver.assetExts = [...config.resolver.assetExts, 'xlsx'];

module.exports = config;
