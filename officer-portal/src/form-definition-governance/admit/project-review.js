import { getDataOwn, isPlainDataObject, ownStringKeys } from './safe-object.js'

/**
 * Safe read-only review projection from an already-admitted definition snapshot.
 * Never exposes raw JSON by default.
 */
export function projectGovernanceReview(snapshot) {
  if (!snapshot?.definition) {
    return { ok: false }
  }
  const { definition, fieldOrder } = snapshot
  try {
    const provenanceByField = new Map(
      definition.meta.paletteProvenance.map((entry) => [entry.fieldId, entry.widgetType]),
    )
    const labels = definition.meta.bilingual.labels
    const orderedFields = fieldOrder.map((fieldId) => {
      const label = labels[fieldId]
      return {
        fieldId,
        labelEn: label?.en ?? '',
        labelGu: label?.gu ?? '',
        widgetType: provenanceByField.get(fieldId) ?? 'unknown',
      }
    })

    let labeledEn = 0
    let labeledGu = 0
    let labeledBoth = 0
    for (const field of orderedFields) {
      const hasEn = field.labelEn.length > 0
      const hasGu = field.labelGu.length > 0
      if (hasEn) labeledEn += 1
      if (hasGu) labeledGu += 1
      if (hasEn && hasGu) labeledBoth += 1
    }

    const auditNames = ['createdBy', 'createdAt']
    if (definition.status === 'submitted' && definition.audit.submittedBy) {
      auditNames.push('submittedBy')
    }
    if (definition.status === 'approved') {
      if (definition.audit.submittedBy) auditNames.push('submittedBy')
      if (definition.audit.approvedBy) auditNames.push('approvedBy')
    }
    if (definition.status === 'published') {
      if (definition.audit.submittedBy) auditNames.push('submittedBy')
      if (definition.audit.approvedBy) auditNames.push('approvedBy')
      if (definition.audit.publishedAt) auditNames.push('publishedAt')
    }

    const auditFields = auditNames.map((name) => ({
      name,
      present: typeof definition.audit[name] === 'string',
    }))

    return {
      ok: true,
      review: {
        serviceId: definition.serviceId,
        version: definition.version,
        status: definition.status,
        fieldCount: orderedFields.length,
        fields: orderedFields,
        progressiveSteps: definition.meta.progressiveSteps.map((step) => ({
          stepId: step.stepId,
          labelEn: step.labelEn,
          labelGu: step.labelGu,
          fieldIds: [...step.fieldIds],
        })),
        bilingualSummary: {
          orderedFieldCount: orderedFields.length,
          labeledEn,
          labeledGu,
          labeledBoth,
        },
        bindingCounts: {
          prefill: definition.meta.prefillBindings.length,
          integration: definition.meta.integrationBindings.length,
          workflow: definition.meta.workflowBindings.length,
        },
        auditFields,
      },
    }
  } catch {
    return { ok: false }
  }
}

/** Lightweight helper used by tests to ensure no secret fields leak into review. */
export function reviewContainsForbiddenSecrets(review, secrets) {
  const text = JSON.stringify(review)
  return secrets.some((secret) => text.includes(secret))
}

export function readUiOrderSafely(uiSchema) {
  if (!isPlainDataObject(uiSchema)) {
    return null
  }
  const keys = ownStringKeys(uiSchema)
  if (keys === null || !keys.includes('ui:order')) {
    return []
  }
  const order = getDataOwn(uiSchema, 'ui:order')
  if (!order.ok) {
    return null
  }
  return order.value
}
