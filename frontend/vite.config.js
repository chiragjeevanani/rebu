import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: the admin panel talks to the REBU backend through this proxy, so the
// API client can use relative URLs (VITE_API_URL unset).
const BACKEND = 'http://localhost:4000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/uploads': { target: BACKEND, changeOrigin: true },
      '/socket.io': { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
})
