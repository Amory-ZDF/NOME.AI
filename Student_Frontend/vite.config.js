import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/student/',
  server: {
    port: 5173,
    open: false,
    // Local dev gateway: the browser talks to Vite only; Vite fans out by route.
    //   /api/agent/*  -> Python agent service (:8000)
    //   /api/*        -> TypeScript Student-Backend (:3001)
    // Order matters: the more specific `/api/agent` prefix must win over `/api`.
    proxy: {
      '/api/agent': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    clearMocks: true,
    restoreMocks: true,
  },
})
