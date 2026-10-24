import { describe, expect, it } from 'vitest'

import {
  PALETTE_GROUP_IDS,
  PALETTE_GROUPS,
  PALETTE_REGISTRY,
  PALETTE_WIDGET_COUNT,
  buildPaletteRegistry,
  getPaletteWidget,
  isApprovedWidgetType,
} from '../src/index.js'

describe('controlled palette registry', () => {
  it('contains the exact number of widgets from specification §4', () => {
    // Spec narrative says "~28"; tables 4.1–4.6 list 30 widget IDs including
    // three display/layout primitives (section-header, info-panel, page-break).
    expect(PALETTE_WIDGET_COUNT).toBe(30)
    expect(PALETTE_REGISTRY).toHaveLength(30)
  })

  it('declares six palette groups matching specification sections 4.1–4.6', () => {
    expect(PALETTE_GROUP_IDS).toEqual([
      'identity-citizen',
      'address',
      'documents',
      'choice-structured',
      'free-numeric',
      'government-composite-layout',
    ])
    expect(PALETTE_GROUPS).toHaveLength(6)
  })

  it('ensures every widget ID is unique', () => {
    const ids = PALETTE_REGISTRY.map((widget) => widget.widgetType)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('rejects duplicate widget IDs during registry construction', () => {
    const sample = PALETTE_REGISTRY[0]
    expect(sample).toBeDefined()
    if (!sample) {
      return
    }
    expect(() => buildPaletteRegistry([sample, { ...sample }])).toThrow(
      /Duplicate palette widgetType/,
    )
  })

  it('ensures every widget belongs to a declared group', () => {
    const groupIds = new Set(PALETTE_GROUPS.map((group) => group.groupId))
    for (const widget of PALETTE_REGISTRY) {
      expect(groupIds.has(widget.groupId)).toBe(true)
    }
  })

  it('requires non-empty English and Gujarati labels on every widget', () => {
    for (const widget of PALETTE_REGISTRY) {
      expect(widget.labelEn.trim().length).toBeGreaterThan(0)
      expect(widget.labelGu.trim().length).toBeGreaterThan(0)
      expect(widget.descriptionEn.trim().length).toBeGreaterThan(0)
      expect(widget.descriptionGu.trim().length).toBeGreaterThan(0)
    }
  })

  it('requires at least one baked-in behaviour per widget', () => {
    for (const widget of PALETTE_REGISTRY) {
      expect(widget.bakedInBehaviours.length).toBeGreaterThan(0)
    }
  })

  it('keeps all palette widgets implemented after FB-A12', () => {
    const implemented = PALETTE_REGISTRY.filter((w) => w.implementationStatus === 'implemented')
    const planned = PALETTE_REGISTRY.filter((w) => w.implementationStatus === 'planned')
    expect(implemented).toHaveLength(30)
    expect(planned).toHaveLength(0)
  })

  it('looks up known widgets including layout primitives', () => {
    for (const id of [
      'aadhaar',
      'address-block',
      'doc-upload',
      'bank-account',
      'eligibility-declaration',
      'fee-field',
      'signature-esign',
      'family-repeater',
      'page-break',
    ] as const) {
      const widget = getPaletteWidget(id)
      expect(widget).toBeDefined()
      expect(widget?.widgetType).toBe(id)
    }
  })

  it('returns undefined for unknown widget lookup', () => {
    expect(getPaletteWidget('custom-field')).toBeUndefined()
    expect(getPaletteWidget('raw-json')).toBeUndefined()
    expect(getPaletteWidget('not-a-real-widget')).toBeUndefined()
  })

  it('rejects custom-field and raw-json via isApprovedWidgetType', () => {
    expect(isApprovedWidgetType('aadhaar')).toBe(true)
    expect(isApprovedWidgetType('custom-field')).toBe(false)
    expect(isApprovedWidgetType('raw-json')).toBe(false)
  })

  it('marks layout and display widgets as non-data-producing', () => {
    const sectionHeader = getPaletteWidget('section-header')
    const infoPanel = getPaletteWidget('info-panel')
    const pageBreak = getPaletteWidget('page-break')

    expect(sectionHeader?.category).toBe('display')
    expect(sectionHeader?.producesData).toBe(false)
    expect(infoPanel?.category).toBe('display')
    expect(infoPanel?.producesData).toBe(false)
    expect(pageBreak?.category).toBe('layout')
    expect(pageBreak?.producesData).toBe(false)
  })

  it('marks data widgets as data-producing', () => {
    for (const id of [
      'aadhaar',
      'address-block',
      'doc-upload',
      'bank-account',
      'eligibility-declaration',
      'family-repeater',
      'fee-field',
      'signature-esign',
    ] as const) {
      const widget = getPaletteWidget(id)
      expect(widget?.category).toBe('data')
      expect(widget?.producesData).toBe(true)
    }
  })

  it('preserves locked configurable properties from the specification', () => {
    expect(getPaletteWidget('aadhaar')?.configurableProperties).toEqual(['label', 'required'])
    expect(getPaletteWidget('mobile-otp')?.configurableProperties).toEqual([
      'label',
      'required',
      'OTP channel(s)',
    ])
    expect(getPaletteWidget('caf-prefill')?.configurableProperties).toEqual([
      'label',
      'cafAttribute',
      'confidenceMin',
    ])
    expect(getPaletteWidget('doc-upload')?.configurableProperties).toEqual([
      'label',
      'required',
      'allowed types',
      'max size',
    ])
    expect(getPaletteWidget('cascading-dropdown')?.configurableProperties).toEqual([
      'label',
      'required',
      'parent+child list ids',
    ])
    expect(getPaletteWidget('family-repeater')?.configurableProperties).toEqual([
      'label',
      'member fields',
      'min/max rows',
    ])
    expect(getPaletteWidget('info-panel')?.configurableProperties).toEqual(['content (EN/GU)'])
    expect(getPaletteWidget('page-break')?.configurableProperties).toEqual(['step label (EN/GU)'])
  })
})
