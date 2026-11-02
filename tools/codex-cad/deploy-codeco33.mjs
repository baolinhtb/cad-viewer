// Explicit deployment for the existing codeco33 host, not a generic installer.
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  mkdtempSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = '/srv/cad-viewer'
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const inspect = args =>
  execFileSync('docker', args, { cwd: root, encoding: 'utf8' }).trim()
const networks = JSON.parse(
  inspect([
    'inspect',
    'cad-viewer-auth',
    '--format',
    '{{json .NetworkSettings.Networks}}'
  ])
)
const network = networks['cad-viewer_default']
if (network?.Gateway !== '172.21.0.1' || network.IPAddress !== '172.21.0.2')
  throw new Error(
    'Private bridge addresses differ; review service configuration before deploy.'
  )

const stamp = new Date()
  .toISOString()
  .replace(/[^0-9]/g, '')
  .slice(0, 14)
const viewerBackup = `cad-viewer:before-codex-${stamp}`
const authBackup = `cad-viewer-auth:before-codex-${stamp}`
run('docker', ['tag', 'cad-viewer:latest', viewerBackup])
run('docker', ['tag', 'cad-viewer-auth:latest', authBackup])
writeFileSync(
  '/tmp/cad-codex-rollback.json',
  JSON.stringify({ viewerBackup, authBackup }, null, 2)
)

// Preserve only network/CA variables needed by the existing authenticated CLI.
// No credential files are read, and no environment values are printed.
const names = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE'
]
writeFileSync(
  '/etc/cad-codex-bridge.env',
  names
    .filter(name => process.env[name])
    .map(name => `${name}=${JSON.stringify(process.env[name])}`)
    .join('\n') + '\n',
  { mode: 0o600 }
)
chmodSync('/etc/cad-codex-bridge.env', 0o600)
copyFileSync(
  path.join(root, 'tools/codex-cad/cad-codex-bridge.service'),
  '/etc/systemd/system/cad-codex-bridge.service'
)
run('systemctl', ['daemon-reload'])
run('systemctl', ['enable', '--now', 'cad-codex-bridge.service'])
run('systemctl', ['restart', 'cad-codex-bridge.service'])

run('docker', [
  'build',
  '-f',
  'server/auth/Dockerfile',
  '-t',
  'cad-viewer-auth:latest',
  '.'
])
const context = mkdtempSync(path.join(os.tmpdir(), 'cad-codex-image-'))
cpSync(
  path.join(root, 'packages/cad-viewer-example/dist'),
  path.join(context, 'cad-viewer'),
  { recursive: true }
)
writeFileSync(
  path.join(context, 'Dockerfile'),
  `FROM ${viewerBackup}\nCOPY cad-viewer/ /usr/share/nginx/html/cad-viewer/\n`
)
run('docker', ['build', '-t', 'cad-viewer:latest', context])
run('docker', [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.codex.yml',
  'up',
  '-d',
  '--no-deps',
  '--force-recreate',
  'auth'
])
const after = JSON.parse(
  inspect([
    'inspect',
    'cad-viewer-auth',
    '--format',
    '{{json .NetworkSettings.Networks}}'
  ])
)
if (after['cad-viewer_default']?.IPAddress !== '172.21.0.2')
  throw new Error(
    'Auth address changed. Update bridge peer list before enabling chat.'
  )
run('docker', [
  'compose',
  '-f',
  'docker-compose.yml',
  '-f',
  'docker-compose.codex.yml',
  'up',
  '-d',
  '--no-deps',
  '--force-recreate',
  'cad-viewer'
])
console.log(
  'Deployment complete. Rollback image tags are recorded in /tmp/cad-codex-rollback.json'
)
