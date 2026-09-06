import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildId = process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.VITE_BUILD_ID
  || `dev-${Date.now()}`

/** Limpia SW/caché cuando hay deploy nuevo (evita 404 en bundles viejos). */
function deployCacheBustPlugin() {
  const snippet = `<script>(function(){var v=${JSON.stringify(buildId)},k="pbc_build_v2",r="pbc_reload";try{if(sessionStorage.getItem(r))return sessionStorage.removeItem(r);var p=localStorage.getItem(k);if(p&&p!==v){localStorage.setItem(k,v);sessionStorage.setItem(r,"1");var done=function(){location.reload()};var jobs=[Promise.resolve()];if("serviceWorker"in navigator){jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(x){return x.unregister()}))}))}if(window.caches){jobs.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(c){return caches.delete(c)}))}))}Promise.all(jobs).then(done).catch(done);return}localStorage.setItem(k,v)}catch(e){}})();</script>`
  return {
    name: 'deploy-cache-bust',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    ${snippet}`)
    },
  }
}

// HTTPS local solo si lo pedís: VITE_DEV_HTTPS=1 npm run dev
const useDevHttps = process.env.VITE_DEV_HTTPS === '1'

export default defineConfig({
  plugins: [
    deployCacheBustPlugin(),
    react(),
    tailwindcss(),
    // ...(useDevHttps ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true,
        type: 'module',
      },
      includeAssets: ['favicon.svg', 'logo.png', 'pwa-192x192.png', 'pwa-512x512.png'],
      manifest: {
        id: '/',
        name: 'Petsitting by Cathy',
        short_name: 'Petsitting',
        description: 'Gestión de Guardería Canina',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'es',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Desactivar NavigationRoute: el default de vite-plugin-pwa es "index.html"
        // y con globPatterns sin html Workbox tira non-precached-url.
        navigateFallback: null,
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/health/],
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
})
