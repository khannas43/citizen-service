#!/usr/bin/env node
/**
 * Build + npm-pack @dg20/form-builder-app embed artifact (FB-E5.4.3A).
 * Staging uses a clean package.json (peer React only) because the embed bundle
 * already inlines workspace Form packages.
 */
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(root, 'apps/form-builder')
const outDir = path.join(root, 'dist/vendor-packs')
const stageDir = path.join(outDir, 'stage-form-builder-app')

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

await mkdir(outDir, { recursive: true })
run('npm', ['run', 'build:embed', '-w', '@dg20/form-builder-app'], root)

await rm(stageDir, { recursive: true, force: true })
await mkdir(path.join(stageDir, 'dist/embed'), { recursive: true })
await cp(path.join(appDir, 'dist/embed'), path.join(stageDir, 'dist/embed'), { recursive: true })
await cp(path.join(appDir, 'embed.d.ts'), path.join(stageDir, 'embed.d.ts'))

const sourcePkg = JSON.parse(await readFile(path.join(appDir, 'package.json'), 'utf8'))
const packPkg = {
  name: sourcePkg.name,
  version: sourcePkg.version,
  description: sourcePkg.description,
  type: 'module',
  private: true,
  exports: sourcePkg.exports,
  files: ['dist/embed', 'embed.d.ts'],
  peerDependencies: {
    react: '^19.0.0',
    'react-dom': '^19.0.0',
  },
}
await writeFile(path.join(stageDir, 'package.json'), `${JSON.stringify(packPkg, null, 2)}\n`)

const pack = spawnSync('npm', ['pack', '--ignore-scripts', '--json'], {
  cwd: stageDir,
  encoding: 'utf8',
  shell: false,
})
if (pack.status !== 0) {
  process.stderr.write(pack.stderr || pack.stdout || 'npm pack failed\n')
  process.exit(pack.status ?? 1)
}

const packed = JSON.parse(pack.stdout)
const entry = Array.isArray(packed) ? packed[0] : packed
const filename = entry.filename
const from = path.join(stageDir, filename)
const to = path.join(outDir, filename)
await cp(from, to)
await rm(from, { force: true })

const bytes = await readFile(to)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const manifest = {
  name: packPkg.name,
  version: packPkg.version,
  filename,
  sha256,
  packedAt: new Date().toISOString(),
  exports: ['./embed', './styles/embed.css'],
}
await writeFile(
  path.join(outDir, 'builder-embed-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
await rm(stageDir, { recursive: true, force: true })

process.stdout.write(`Packed ${filename} → ${to}\nsha256=${sha256}\n`)
