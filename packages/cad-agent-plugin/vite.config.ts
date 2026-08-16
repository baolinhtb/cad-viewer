import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import { defineConfig, PluginOption } from 'vite'
import {
  createLibEntryFileName,
  createLibRollupOutput
} from '../vite-config/pluginRollupOutput'

const packageId = 'cad-agent-plugin'
const packageName = '@mlightcad/cad-agent-plugin'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        register: resolve(__dirname, 'src/register.ts')
      },
      name: packageId,
      fileName: (format, entryName) =>
        createLibEntryFileName(packageId, format, entryName)
    },
    minify: true,
    rollupOptions: {
      // The lazy loader in `src/register.ts` imports this package by name so
      // the reference survives bundling. Rollup must leave that import alone:
      // resolving it means resolving `dist/`, which this build is what
      // produces. Every other plugin externalises its own name for the same
      // reason — without it the build works only where a previous `dist/`
      // happens to be lying around, and fails in a clean tree.
      external: [packageName],
      output: {
        ...createLibRollupOutput(packageId),
        // Keep `style.css` so `@mlightcad/cad-agent-plugin/style.css` resolves
        // (Vite 6 lib mode defaults to `{name}.css` instead of `style.css`).
        assetFileNames: 'style[extname]'
      }
    }
  },
  plugins: [vue(), peerDepsExternal() as PluginOption]
})
