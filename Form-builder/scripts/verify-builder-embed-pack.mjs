#!/usr/bin/env node
/**
 * Drift check for Form Builder embed pack + officer vendor tarball (FB-E5.4.3A).
 */
import { createHash } from 'node:crypto'
import { readFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packsDir = path.join(root, 'dist/vendor-packs')
const manifestPath = path.join(packsDir, 'builder-embed-manifest.json')
const officerVendorDir = path.resolve(root, '../officer-portal/vendor/dg20')

async function sha256File(filePath) {
  const bytes = await readFile(filePath)
  return createHash('sha256').update(bytes).digest('hex')
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const packedPath = path.join(packsDir, manifest.filename)
await access(packedPath)
const packedSha = await sha256File(packedPath)
if (packedSha !== manifest.sha256) {
  throw new Error(`Packed tarball sha256 drift: expected ${manifest.sha256}, got ${packedSha}`)
}

const pkg = JSON.parse(await readFile(path.join(root, 'apps/form-builder/package.json'), 'utf8'))
if (pkg.name !== manifest.name || pkg.version !== manifest.version) {
  throw new Error(
    `Manifest version drift: package ${pkg.name}@${pkg.version} vs manifest ${manifest.name}@${manifest.version}`,
  )
}

const officerTarball = path.join(officerVendorDir, manifest.filename)
try {
  await access(officerTarball)
  const officerSha = await sha256File(officerTarball)
  if (officerSha !== manifest.sha256) {
    throw new Error(
      `Officer vendor tarball drift vs Form-builder pack: ${officerSha} !== ${manifest.sha256}`,
    )
  }
  process.stdout.write(`OK embed pack + officer vendor match (${manifest.filename})\n`)
} catch (error) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    process.stdout.write(
      `OK embed pack (${manifest.filename}); officer vendor copy not present yet\n`,
    )
    process.exit(0)
  }
  throw error
}
