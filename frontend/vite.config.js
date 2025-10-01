import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,           // listen on 0.0.0.0 in container
    port: 5173,
    strictPort: true,
    watch: { usePolling: true },        // Docker/Windows: use polling
    hmr: {
      host: 'localhost',  // what the browser uses to reach it
      port: 5173,
      protocol: 'ws'
    }
  }
})
