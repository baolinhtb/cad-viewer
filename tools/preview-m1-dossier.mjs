// Produce review artifacts without an AI key or a running web server.
// Build workspace packages first, then:
// node tools/preview-m1-dossier.mjs /tmp/m1-preview
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const viteRequire = createRequire(require.resolve('vite'))
const { build } = viteRequire('esbuild')
const pluginRequire = createRequire(
  path.join(root, 'packages/cad-template-plugin/package.json')
)
const destination = path.resolve(process.argv[2] || '/tmp/m1-preview')
await mkdir(destination, { recursive: true })
const bundle = path.join(destination, 'build-preview.cjs')
await build({
  stdin: {
    contents: `
      import {buildDossierModel} from './packages/cad-template-plugin/src/dossier/model';
      import {buildDossierScene} from './packages/cad-template-plugin/src/dossier/scene';
      import {dossierHtml,dossierSheetSvg,dossierDxf} from './packages/cad-template-plugin/src/dossier/export';
      export function artifacts(){
        const scene=buildDossierScene(buildDossierModel());
        return {scene,html:dossierHtml(scene),dxf:dossierDxf(scene),svgs:scene.sheets.map(s=>({id:s.id,svg:dossierSheetSvg(s)}))};
      }`,
    resolveDir: root,
    sourcefile: 'dossier-preview.ts'
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: bundle,
  plugins: [
    {
      name: 'workspace-runtime',
      setup(builder) {
        builder.onResolve(
          { filter: /^@mlightcad\/(cad-template-sdk|data-model)$/ },
          args => ({ path: pluginRequire.resolve(args.path), external: true })
        )
      }
    }
  ]
})
const { artifacts } = require(bundle)
const result = artifacts()
await Promise.all([
  writeFile(path.join(destination, 'M1-ban-nhap.html'), result.html),
  writeFile(path.join(destination, 'M1-ban-nhap.dxf'), result.dxf),
  writeFile(
    path.join(destination, 'M1-scene.json'),
    JSON.stringify(result.scene, null, 2)
  ),
  ...result.svgs.map(s =>
    writeFile(path.join(destination, `${s.id}.svg`), s.svg)
  )
])
console.log(
  JSON.stringify(
    {
      destination,
      sheets: result.scene.sheets.map(s => ({
        id: s.id,
        entities: s.primitives.length
      })),
      issues: result.scene.model.issues.map(i => i.code)
    },
    null,
    2
  )
)
