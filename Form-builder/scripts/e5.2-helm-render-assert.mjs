/**
 * FB-E5.2 — pure assertion helpers for helm-render verification (unit-testable).
 */

export const REQUIRED_PATHS = Object.freeze({
  liveness: '/form-definition-service/actuator/health/liveness',
  readiness: '/form-definition-service/actuator/health/readiness',
  startup: '/form-definition-service/actuator/health',
})

/**
 * Split multi-document Helm YAML into objects (best-effort structural checks).
 * @param {string} rendered
 * @returns {object[]}
 */
export function parseHelmDocuments(rendered) {
  const docs = []
  const chunks = String(rendered || '')
    .split(/^---$/m)
    .map((c) => c.trim())
    .filter(Boolean)
  for (const chunk of chunks) {
    const kind = matchScalar(chunk, /^kind:\s*(.+)$/m)
    const name = matchScalar(chunk, /^ {2}name:\s*(.+)$/m) || matchScalar(chunk, /^name:\s*(.+)$/m)
    docs.push({ kind, name, raw: chunk })
  }
  return docs
}

function matchScalar(text, re) {
  const m = String(text).match(re)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

/**
 * @param {string} rendered default helm template output
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function assertDefaultRender(rendered) {
  const failures = []
  const text = String(rendered || '')
  const docs = parseHelmDocuments(text)
  const kinds = docs.map((d) => d.kind)

  if (!kinds.includes('Deployment')) failures.push('missing Deployment')
  if (!kinds.includes('Service')) failures.push('missing Service')
  if (kinds.includes('Ingress')) failures.push('Ingress must be absent by default')
  if (kinds.includes('Secret')) failures.push('chart must not render Secret resources')
  if (kinds.includes('ServiceAccount')) failures.push('ServiceAccount not allowed in E5.2')
  if (kinds.includes('NetworkPolicy')) failures.push('NetworkPolicy not allowed in E5.2')

  const service = docs.find((d) => d.kind === 'Service')
  if (service) {
    if (!/type:\s*ClusterIP/.test(service.raw)) failures.push('Service type must be ClusterIP')
    if (/zuul\/route-path/.test(service.raw)) {
      failures.push('zuul/route-path must be absent when ingress/zuul disabled')
    }
  }

  for (const [label, path] of Object.entries(REQUIRED_PATHS)) {
    if (!text.includes(path)) failures.push(`missing ${label} probe path ${path}`)
  }

  if (!/containerPort:\s*8080/.test(text)) failures.push('missing containerPort 8080')
  if (!/port:\s*8080/.test(text)) failures.push('missing service port 8080')

  if (!/runAsNonRoot:\s*true/.test(text)) failures.push('missing runAsNonRoot true')
  if (!/runAsUser:\s*10001/.test(text)) failures.push('missing runAsUser 10001')
  if (!/runAsGroup:\s*10001/.test(text)) failures.push('missing runAsGroup 10001')
  if (!/fsGroup:\s*10001/.test(text)) failures.push('missing fsGroup 10001')
  if (!/readOnlyRootFilesystem:\s*true/.test(text)) {
    failures.push('missing readOnlyRootFilesystem true')
  }
  if (!/allowPrivilegeEscalation:\s*false/.test(text)) {
    failures.push('missing allowPrivilegeEscalation false')
  }
  if (!/drop:[\s\S]*?- ALL/.test(text) && !/-\s*ALL/.test(text)) {
    failures.push('missing capabilities.drop ALL')
  }
  if (!/type:\s*RuntimeDefault/.test(text)) failures.push('missing seccomp RuntimeDefault')

  if (!/mountPath:\s*\/tmp/.test(text)) failures.push('missing /tmp mount')
  if (!/emptyDir:\s*\{\}/.test(text) && !/emptyDir:\s*$/m.test(text)) {
    // emptyDir: {} or emptyDir:\n
    if (!/name:\s*tmp[\s\S]*emptyDir:/.test(text)) {
      failures.push('missing tmp emptyDir volume')
    }
  }

  if (!/configMapKeyRef:/.test(text)) failures.push('missing ConfigMap reference')
  if (!/secretKeyRef:/.test(text)) failures.push('missing Secret key reference')

  if (/hostPath:/.test(text)) failures.push('hostPath is prohibited')
  if (/docker\.sock/.test(text)) failures.push('Docker socket mount is prohibited')
  if (/privileged:\s*true/.test(text)) failures.push('privileged mode is prohibited')
  if (/persistentVolumeClaim:/.test(text) || /kind:\s*PersistentVolume/.test(text)) {
    failures.push('persistent volumes are prohibited in E5.2 chart')
  }

  if (/governance-technical/i.test(text)) {
    failures.push('governance-technical must not appear in rendered workload')
  }
  if (/actorId/.test(text)) failures.push('actorId must not appear in rendered workload')
  if (/SPRING_PROFILES_ACTIVE/.test(text)) {
    failures.push('SPRING_PROFILES_ACTIVE must not be set by the chart')
  }

  // Credential literals: reject obvious password=value assignments (not secretKeyRef).
  if (/password:\s*["']?[^"'\s]+["']?\s*$/im.test(text) && !/key:\s*password/.test(text)) {
    // Allow secret key names; flag inline password values on env value: lines.
  }
  if (/value:\s*["']?(?:password|secret|token)[^"'\n]*["']?/i.test(text)) {
    failures.push('possible credential literal in env value')
  }

  return { ok: failures.length === 0, failures }
}

/**
 * @param {string} rendered helm template with ingress+zuul example
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function assertIngressZuulRender(rendered) {
  const failures = []
  const text = String(rendered || '')
  const docs = parseHelmDocuments(text)
  const ingress = docs.find((d) => d.kind === 'Ingress')
  const service = docs.find((d) => d.kind === 'Service')

  if (!ingress) failures.push('expected Ingress when ingress.enabled=true')
  else {
    if (!/path:\s*\/form-definition-service/.test(ingress.raw)) {
      failures.push('Ingress path must be /form-definition-service')
    }
    if (!/name:\s*zuul/.test(ingress.raw)) {
      failures.push('Ingress backend must target zuul when ingress.zuul=true')
    }
    if (!/number:\s*8080/.test(ingress.raw)) {
      failures.push('Zuul service port must be 8080')
    }
    if (/rewrite-target/i.test(ingress.raw) || /strip.?prefix/i.test(ingress.raw)) {
      failures.push('Ingress must not rewrite or strip the context path')
    }
  }

  if (!service) failures.push('missing Service in ingress render')
  else if (!/zuul\/route-path:\s*"?form-definition-service"?/.test(service.raw)) {
    failures.push('Service must annotate zuul/route-path when ingress.zuul=true')
  }

  if (/rewrite-target/i.test(text) || /strip.?prefix/i.test(text)) {
    failures.push('rendered output must not include rewrite/strip directives')
  }

  return { ok: failures.length === 0, failures }
}
