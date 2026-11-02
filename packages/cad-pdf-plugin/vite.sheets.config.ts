import { resolve } from 'path'
import { defineConfig } from 'vite'

/** Packet export does not need the CAD/PDF-import module graph. */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/AcApSheetPdf.ts'),
      formats: ['es', 'cjs'],
      fileName: format =>
        format === 'es' ? 'cad-pdf-sheets.js' : 'cad-pdf-sheets.cjs'
    },
    minify: true
  }
})
