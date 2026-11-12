import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  publicDir: false,
  plugins: [
    tailwindcss(),
    react(),
    viteSingleFile(),
  ],
  build: {
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
})
