import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// LAN配信用のHTTPS証明書(mkcertで生成、README参照)。なければ通常のHTTP。
// PWA(Service Worker・通知)はHTTPSまたはlocalhostでのみ動作するため、
// スマホからLAN経由で使う場合は certs/ に証明書を置くこと。
const https =
  existsSync('certs/cert.pem') && existsSync('certs/key.pem')
    ? { cert: readFileSync('certs/cert.pem'), key: readFileSync('certs/key.pem') }
    : undefined;

export default defineConfig({
  // GitHub Pages はサブパス配信のため、CI では BASE_PATH=/2nd-foreign-lang-app/ を渡す
  base: process.env.BASE_PATH ?? '/',
  server: { https },
  preview: { https },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
      },
      manifest: {
        name: '語彙トレ — 第二外国語 語彙強化',
        short_name: '語彙トレ',
        description: '第二外国語(中国語・タイ語)の語彙を間隔反復で強化するアプリ',
        lang: 'ja',
        display: 'standalone',
        background_color: '#1a1d29',
        theme_color: '#1a1d29',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
