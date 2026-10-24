# DG 2.0 Demo — Phase 0 + Workflow-Routing Spec

Scope: stand up a real local DIGIT environment, and prove that one application can be routed through a DIGIT service (egov-workflow-v2) and a custom-built service that embeds Flowable, side by side. Nothing else — no citizen UI, no officer UI, no AI. Those come in the next spec, once this slice is working.

---

## 1. Definition of done

This phase is done when all of the following are true, checked from a terminal, no UI required:

1. `kubectl get pods` shows Postgres, Kafka, Keycloak, `egov-mdms-service`, `egov-workflow-v2`, `egov-user`, `egov-persister`, and `egov-indexer` all in `Running` state — this is the DIGIT side.
2. A sample business service ("Marriage Certificate") is configured in `egov-workflow-v2` via MDMS, with at least two states (`PENDINGAPPROVAL` → `APPROVED`).
3. A custom-built service — `caste-certificate-service` — is running (as a local process during development, containerised once stable). This is your own code, not a DIGIT module and not a call to Flowable's own server. It embeds the Flowable engine as a library and exposes its own API.
4. A BPMN process ("Caste Certificate Approval", two human tasks) is loaded into that embedded engine at startup — modelled visually first in Flowable's standalone modeler, then committed as a `.bpmn20.xml` resource the custom service loads.
5. Submitting a test application against the Marriage Certificate service creates a process instance in egov-workflow-v2, retrievable via its own search API.
6. Submitting a test application against `caste-certificate-service`'s own API creates a process instance inside its embedded Flowable engine, retrievable via that same custom API — not via a separate Flowable REST container.
7. Both of the above are demonstrated from two genuinely different services on purpose — one a DIGIT module, one a custom-built service you wrote that happens to use Flowable internally. That's what proves the "two engines, one queue" claim in the bid PPT is real, not just a diagram, and it proves it more honestly than calling Flowable's own server directly would have.

Nothing about citizen identity, the family/eligibility engine, or the officer UI is in scope here. That's the next spec, written after this one is actually working.

---

## 2. The official DIGIT setup path — verified, not guessed

I want to flag this clearly: DIGIT's own recommended local setup is Kubernetes + Helm, not a hand-rolled docker-compose file. A previous version of this kind of plan assumed plain docker-compose would work, and I'd correct that now rather than hand you a compose file that fights the platform's actual deployment model. The real path:

- **Cluster**: `kind` (Kubernetes in Docker) is the lightest way to get a real local K8s API on a Mac without a separate VM layer — works cleanly with OrbStack or Docker Desktop underneath.
- **Canonical repo**: `egovernments/Digit-Core` on GitHub is the current OSS DIGIT repository.
- **Developer guide**: `core.digit.org/guides/developer-guide` — has a "Section 0 — Prep" through several sections covering local environment setup, service configuration, and advanced integrations (PDF service, certificate generation, etc.). Read Section 0 and the workflow/MDMS sections before touching Helm values.
- **Installer tool**: `DIGIT-DevOps/deploy-as-code/egov-deployer` is an interactive Go tool (`go run digit_setup.go`) that asks which DIGIT modules you want and generates the Kubernetes manifests for you — this is very likely your fastest path to a running cluster, faster than hand-writing Helm values yourself.
- **Images**: published under the `egovio` Docker Hub namespace (e.g. `egovio/egov-workflow-v2`, `egovio/egov-mdms-service`). Tags follow a CI-build pattern (commit-hash or `DIGIT-X.X-LTS`-style release tags) rather than a clean `latest` — check the live tag list on Docker Hub for each service before pinning a version in your manifests, since I can't verify today's exact current tag from here.
- **Default test credentials** (confirmed from the docs): citizen mobile `9999999999`, OTP `123456`; employee username `GRO`, password `eGov@4321PGR`. Useful once the stack is up — don't reinvent these.

Practical recommendation: run the `egov-deployer` tool first, choosing only the modules you actually need (workflow-v2, user, mdms-service, persister, indexer — skip everything else for this phase), rather than installing the full module catalogue. If the deployer tool turns out to be more than you want to fight with, the fallback is cloning `Digit-Core`, building the handful of services you need from source via Maven, and running them as plain Spring Boot apps against your own Postgres/Kafka/Keycloak — slower to start, but you control every variable.

---

## 3. What you're actually configuring (the part that's mine to spec precisely)

### Business service in egov-workflow-v2 — "Marriage Certificate"
A businessService config with two states and one transition:

```
businessService: MARRIAGE_CERT
states:
  - state: PENDINGAPPROVAL
    sla: 24h (timer boundary)
    actions: [APPROVE -> CERTIFICATE_GENERATED, REJECT -> REJECTED]
  - state: CERTIFICATE_GENERATED
    terminal: true
  - state: REJECTED
    terminal: true
```
This mirrors PPT slide 13's "3-Stage Sequential Approval" pattern, simplified to two stages for the proof.

### The custom service — `caste-certificate-service`
This is the piece that makes the proof honest: a service you actually write, not a configuration of someone else's platform. Build it as a small Spring Boot app using `flowable-spring-boot-starter` — Flowable is designed to be embedded as a library, which is also how most real-world adopters use it, so this isn't an unusual or contrived pattern.

Two reasonable ways to author the BPMN itself, and you can use both: design it visually in Flowable's own standalone BPMN modeler (so you get the same visual authoring experience as the bid PPT's diagrams), export the `.bpmn20.xml`, then drop that file into `src/main/resources/processes/` of your Spring Boot app — `flowable-spring-boot-starter` auto-deploys any process definition it finds there at startup into its own embedded engine. No separate Flowable server needed at runtime.

The service's own API surface, in front of that embedded engine:
```
POST /caste-certificate-service/v1/applications      -> starts the BPMN process, returns engineRef
GET  /caste-certificate-service/v1/applications/{id}  -> reads current task/status from the embedded engine
POST /caste-certificate-service/v1/applications/{id}/approve  -> completes the current task, advances the process
```

### BPMN process — "Caste Certificate Approval"
Two human tasks in sequence, modelled visually first (don't hand-write the BPMN XML):

```
Start -> [Data Entry Officer Review] -> [Talati Verification] -> End
```
Each task has a 24h timer boundary event, matching the same PPT slide 13 pattern. This is deliberately the same shape as the workflow-v2 service above — same SLA discipline, two different engines, so the comparison is apples-to-apples.

### Test data model (minimal, just enough to submit something)
```
Application {
  applicationId: string (UUID)
  serviceCode: "MARRIAGE_CERT" | "CASTE_CERT"
  citizenName: string
  submittedAt: timestamp
  engineRef: string   // "DGT-{processInstanceId}" or "FLW-{processInstanceId}"
}
```
That `engineRef` prefix convention is lifted directly from PPT slide 12 — keep it, since Scene 4 (the merged officer queue, next spec) depends on exactly this prefix-based routing trick.

---

## 4. API contracts to verify once the stack is up

These are DIGIT's well-documented general patterns from training knowledge — accurate in shape, but verify exact field names against the live Swagger/API docs each service exposes once running, rather than trusting these blind:

- **egov-workflow-v2**: `POST /egov-wf/process/_transition` to create/advance a process instance; `POST /egov-wf/process/_search` to query it back.
- **egov-mdms-service**: `POST /egov-mdms-service/v1/_search` to pull the businessService config you've defined.
- **`caste-certificate-service`** (yours — full control, no need to verify against anyone else's docs): the three endpoints in section 3 above. Internally these call Flowable's embedded Java API (`RuntimeService.startProcessInstanceByKey(...)`, `TaskService.complete(...)`) — that Java API is stable and well-documented on Flowable's own site if you want the exact method signatures.

Treat the exact request/response JSON shape for the two DIGIT endpoints as something to confirm from each service's own exposed API docs the first time you call it, not something to assume from this spec. The custom service's contract you control outright — design it to return the same `engineRef` shape from section 3 either way, so Scene 4's merged queue can treat both paths identically later.

---

## 5. Mac tooling checklist

- OrbStack (or Docker Desktop) — container runtime
- `kind` + `kubectl` + `helm` (`brew install kind kubectl helm`)
- `go` — for the `egov-deployer` installer tool
- Java 17 + Maven (or your build tool of choice) — for `caste-certificate-service` itself; add `flowable-spring-boot-starter` as a dependency, not a separate container
- Postman or `curl` — for the API contract verification in section 4
- Flowable's standalone BPMN modeler — design-time only, for drawing the Caste Certificate process before exporting it into the custom service's resources folder. Not a runtime dependency of the demo.

---

## 6. What's deliberately not in this spec

Citizen identity/Keycloak realm setup beyond the default, the family/eligibility data model, the officer merged-queue UI, the chatbot, the lakehouse, the map — all next. This spec only has to prove the DIGIT devstack stands up and that one application can be routed through both engines for real.
