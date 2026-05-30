import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import legacy from '@vitejs/plugin-legacy'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'
import refractionDisplacementMapPlugin from './vitePlugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
    refractionDisplacementMapPlugin(),
    legacy({
      targets: ['safari >= 10', 'chrome >= 66'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: ['safari11', 'chrome66', 'firefox78'],
  },
  server: {
    allowedHosts: [
      "vault.dubstep.win"
    ],
    host: true,
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
    },
  },
})
