import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// PWA-plugin (manifest, service worker) läggs till i P12 tillsammans med
// IndexedDB-persistensen. Se ETAPP1_TEKNISK_SPEC.md avsnitt 10.
export default defineConfig({
  plugins: [react()],
})
