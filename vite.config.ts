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
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
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
