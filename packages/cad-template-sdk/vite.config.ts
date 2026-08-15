import { resolve } from 'path'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import { defineConfig, PluginOption } from 'vite'

import { createLibEntryFileName } from '../vite-config/pluginRollupOutput'

const packageName = '@mlightcad/cad-template-sdk'
const libId = 'cad-template-sdk'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts')
      },
      name: libId,
      fileName: (format, entryName) =>
        createLibEntryFileName(libId, format, entryName)
    },
    minify: true,
    // Single-entry library: Vite turns on `inlineDynamicImports`, which rules
    // out the shared `manualChunks` output used by the multi-entry plugin
    // packages.
    rollupOptions: {
      external: [packageName]
    }
  },
  plugins: [peerDepsExternal() as PluginOption]
})
