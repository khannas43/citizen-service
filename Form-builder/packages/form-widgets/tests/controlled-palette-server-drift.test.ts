import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PALETTE_REGISTRY } from '../src/palette-registry.js'
import { dg20Fields, dg20Widgets } from '../src/widgets/registry.js'

/**
 * Drift guard (FB-C1): server controlled-palette-v1.json must stay aligned with
 * the TypeScript palette + RJSF registries. Maven and npm are never cross-invoked;
 * each side fails independently when registries diverge.
 */

const here = dirname(fileURLToPath(import.meta.url))
const manifestPath = join(
  here,
  '../../../services/form-definition-service/src/main/resources/validation/controlled-palette-v1.json',
)

type ServerEntry = {
  widgetType: string
  category: 'data' | 'display' | 'layout'
  producesData: boolean
  supportsRequired: boolean
  rjsfKind: 'widget' | 'field'
}

type ServerManifest = {
  version: number
  widgets: ServerEntry[]
}

function loadServerManifest(): ServerManifest {
  const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as ServerManifest
  return raw
}

function expectedRjsfKind(widgetType: string): 'widget' | 'field' {
  if (Object.prototype.hasOwnProperty.call(dg20Widgets, widgetType)) {
    return 'widget'
  }
  if (Object.prototype.hasOwnProperty.call(dg20Fields, widgetType)) {
    return 'field'
  }
  throw new Error(`widgetType ${widgetType} missing from dg20Widgets and dg20Fields`)
}

describe('server controlled palette drift (FB-C1)', () => {
  const manifest = loadServerManifest()

  it('loads a version-1 manifest with exactly 30 unique widget types', () => {
    expect(manifest.version).toBe(1)
    expect(manifest.widgets).toHaveLength(30)
    const ids = manifest.widgets.map((w) => w.widgetType)
    expect(new Set(ids).size).toBe(30)
  })

  it('matches PALETTE_REGISTRY count, ids, category, producesData, supportsRequired', () => {
    expect(PALETTE_REGISTRY).toHaveLength(30)
    expect(manifest.widgets).toHaveLength(PALETTE_REGISTRY.length)

    const byType = new Map(manifest.widgets.map((w) => [w.widgetType, w]))
    for (const widget of PALETTE_REGISTRY) {
      const server = byType.get(widget.widgetType)
      expect(server, `missing server entry for ${widget.widgetType}`).toBeDefined()
      expect(server?.category).toBe(widget.category)
      expect(server?.producesData).toBe(widget.producesData)
      expect(server?.supportsRequired).toBe(widget.supportsRequired)
    }

    for (const server of manifest.widgets) {
      const client = PALETTE_REGISTRY.find((w) => w.widgetType === server.widgetType)
      expect(client, `orphan server entry ${server.widgetType}`).toBeDefined()
    }
  })

  it('matches dg20Widgets / dg20Fields rjsfKind assignment', () => {
    const widgetKeys = Object.keys(dg20Widgets)
    const fieldKeys = Object.keys(dg20Fields)
    expect(widgetKeys).toHaveLength(12)
    expect(fieldKeys).toHaveLength(18)
    expect(widgetKeys.length + fieldKeys.length).toBe(30)

    for (const entry of manifest.widgets) {
      expect(entry.rjsfKind).toBe(expectedRjsfKind(entry.widgetType))
    }

    for (const widgetType of widgetKeys) {
      const server = manifest.widgets.find((w) => w.widgetType === widgetType)
      expect(server?.rjsfKind).toBe('widget')
    }
    for (const widgetType of fieldKeys) {
      const server = manifest.widgets.find((w) => w.widgetType === widgetType)
      expect(server?.rjsfKind).toBe('field')
    }
  })

  it('rejects custom-field and raw-json on both sides', () => {
    const ids = new Set(manifest.widgets.map((w) => w.widgetType))
    expect(ids.has('custom-field')).toBe(false)
    expect(ids.has('raw-json')).toBe(false)
    expect(PALETTE_REGISTRY.some((w) => w.widgetType === 'custom-field')).toBe(false)
    expect(PALETTE_REGISTRY.some((w) => w.widgetType === 'raw-json')).toBe(false)
  })
})
