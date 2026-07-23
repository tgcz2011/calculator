import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ponytail: single vite config serves web PWA + Capacitor (uses dist/) + Tauri (uses dist/).
// Native wrappers consume the same web bundle; no per-platform Vite fork needed.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Calculator',
        short_name: 'Calculator',
        description: 'Apple-style calculator',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // ponytail (TGC-29): the GeoGebra GWT bundle vendored under
        // public/geogebra/ is ~53MB (web3d/ permutation + deferredjs +
        // fonts + js language packs + css). It's loaded on demand by the
        // GeoGebra loader via direct <script> + <link> tags — NOT through
        // the app shell — so the service worker doesn't need to precache
        // it. Excluding it keeps the SW manifest small (sub-MB) and lets
        // the GWT bundle stay outside workbox's file-size cap (the two
        // 10MB cache.js chunks would otherwise trip
        // maximumFileSizeToCacheInBytes). Use `globIgnores` for the
        // exclusion (workbox-build's `globPatterns` is purely additive;
        // negation patterns are honoured by some glob libs but not all
        // versions of workbox-build, so the explicit ignore list is the
        // portable path).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: [
          '**/geogebra/**',
          // Workbox stamps its own runtime helper scripts into the build
          // directory too; we don't want the GeoGebra helper paths picked
          // up via the broader pattern if workbox adds any under
          // geogebra-adjacent names. The leading ** keeps it recursive.
        ],
        // The cap stays at 5MB — enough for the rest of the static
        // assets (mathjs chunk is 650KB, KaTeX fonts top out at ~60KB
        // each). The GeoGebra bundle's 10MB+ permutation + deferredjs
        // chunks are excluded by globIgnores above and don't count.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      }
    })
  ],
  // ponytail: externals resolved at runtime by native shells; web bundle ignores them.
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    // ponytail: mathjs is ~860KB and dominates the main chunk. Split it into
    // its own chunk so the app shell (React + UI) loads and hydrates before
    // mathjs parses, and so Vite's 500KB chunk-size warning clears.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          mathjs: ['mathjs'],
        },
      },
    },
  }
});
