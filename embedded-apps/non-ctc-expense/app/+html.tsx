// Learn more https://docs.expo.dev/router/reference/static-rendering/#root-html

import { ScrollViewStyleReset } from 'expo-router/html';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* Add any additional <head> elements that you want globally available on web... */}

        {/* This app has no experiments.baseUrl (see build-embedded-apps.js's isFolderBased merge
            path), so Expo's own auto-generated favicon <link> always points at the un-prefixed
            root "/favicon.ico" instead of this app's real "/apps/expense/favicon.ico" — the hub's
            own root favicon shows in the tab instead of this app's. Adding a real favicon.ico to
            this app's own public/ folder makes Expo's export skip that broken auto-injection
            entirely (see @expo/cli's export/favicon.js getUserDefinedFaviconFile check), so this
            explicit, correctly-prefixed tag is the only one that ends up in the page. */}
        <link rel="icon" href="/apps/expense/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
