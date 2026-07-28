import { defineConfig } from 'vite';

export default defineConfig({
  // Vercel 정적 배포 — 루트 기준 절대 경로
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // three 는 별도 청크로 분리 (앱 코드 수정 시 캐시 유지)
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return null;
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    port: 4173,
  },
});
