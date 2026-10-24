import { describe, expect, it } from 'vitest'

import {
  REQUIRED_PATHS,
  assertDefaultRender,
  assertIngressZuulRender,
  parseHelmDocuments,
} from './e5.2-helm-render-assert.mjs'

const sampleDefault = `
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: form-definition-service
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile:
          type: RuntimeDefault
      volumes:
        - name: tmp
          emptyDir: {}
      containers:
        - name: form-definition-service
          image: egovio/form-definition-service:e5.2-render-only
          ports:
            - containerPort: 8080
          securityContext:
            runAsNonRoot: true
            runAsUser: 10001
            runAsGroup: 10001
            readOnlyRootFilesystem: true
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
            seccompProfile:
              type: RuntimeDefault
          volumeMounts:
            - name: tmp
              mountPath: /tmp
          startupProbe:
            httpGet:
              path: ${REQUIRED_PATHS.startup}
              port: 8080
          livenessProbe:
            httpGet:
              path: ${REQUIRED_PATHS.liveness}
              port: 8080
          readinessProbe:
            httpGet:
              path: ${REQUIRED_PATHS.readiness}
              port: 8080
          env:
            - name: SPRING_DATASOURCE_URL
              valueFrom:
                configMapKeyRef:
                  name: egov-config
                  key: db-url
            - name: SPRING_DATASOURCE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db
                  key: password
---
apiVersion: v1
kind: Service
metadata:
  name: form-definition-service
spec:
  type: ClusterIP
  ports:
    - port: 8080
      targetPort: 8080
`

const sampleIngress = `
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: form-definition-service
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: example.invalid
      http:
        paths:
          - backend:
              service:
                name: zuul
                port:
                  number: 8080
            path: /form-definition-service
            pathType: ImplementationSpecific
---
apiVersion: v1
kind: Service
metadata:
  name: form-definition-service
  annotations:
    zuul/route-path: form-definition-service
spec:
  type: ClusterIP
`

describe('FB-E5.2 helm render assertions', () => {
  it('parses helm documents by kind', () => {
    const docs = parseHelmDocuments(sampleDefault)
    expect(docs.map((d) => d.kind)).toEqual(['Deployment', 'Service'])
  })

  it('accepts a compliant default render', () => {
    const result = assertDefaultRender(sampleDefault)
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects governance-technical and Ingress on default path', () => {
    const bad = `${sampleDefault}\n---\nkind: Ingress\nmetadata:\n  name: x\n`
    const withGov = sampleDefault.replace(
      'egovio/form-definition-service:e5.2-render-only',
      'egovio/form-definition-service:governance-technical',
    )
    expect(assertDefaultRender(bad).ok).toBe(false)
    expect(
      assertDefaultRender(withGov).failures.some((f) => f.includes('governance-technical')),
    ).toBe(true)
  })

  it('accepts path-preserving ingress/zuul render', () => {
    const result = assertIngressZuulRender(sampleIngress)
    expect(result.failures).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('rejects rewrite-target on ingress render', () => {
    const bad = sampleIngress.replace(
      'kubernetes.io/ingress.class: nginx',
      'nginx.ingress.kubernetes.io/rewrite-target: /\n    kubernetes.io/ingress.class: nginx',
    )
    expect(assertIngressZuulRender(bad).ok).toBe(false)
  })
})
