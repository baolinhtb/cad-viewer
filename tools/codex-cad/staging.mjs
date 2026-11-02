// Local-only production build preview using the existing authenticated API.
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const directory = path.join(root, 'packages/cad-editor-demo/dist')
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.dxf': 'application/dxf'
}
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname
  if (pathname.startsWith('/api/')) {
    const upstream = request(
      {
        hostname: '127.0.0.1',
        port: 8090,
        path: req.url,
        method: req.method,
        headers: req.headers
      },
      response => {
        res.writeHead(response.statusCode, response.headers)
        response.pipe(res)
      }
    )
    upstream.on('error', error => {
      if (!res.headersSent) res.writeHead(502)
      res.end(error.message)
    })
    req.pipe(upstream)
    return
  }
  if (!pathname.startsWith('/cad-viewer/')) {
    res.writeHead(404).end()
    return
  }
  const relative =
    decodeURIComponent(pathname.slice('/cad-viewer/'.length)) || 'index.html'
  const file = path.resolve(directory, relative)
  if (!file.startsWith(directory + path.sep)) {
    res.writeHead(403).end()
    return
  }
  try {
    res.writeHead(200, {
      'content-type': mime[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store'
    })
    res.end(await readFile(file))
  } catch {
    res.writeHead(404).end()
  }
})
server.listen(4188, '127.0.0.1', () =>
  console.log('Staging http://127.0.0.1:4188/cad-viewer/')
)
