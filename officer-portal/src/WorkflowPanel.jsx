import './WorkflowPanel.css'

const BPMN_SNIPPET = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="org.magicsword.caste">
  <process id="casteCertificateApproval" name="Caste Certificate Approval" isExecutable="true">
    <startEvent id="start" name="Start"/>
    <userTask id="dataEntryReview" name="Data Entry Officer Review"
              flowable:assignee="\${assignee}">
      <documentation>Review submitted caste certificate application for completeness.</documentation>
    </userTask>
    <boundaryEvent id="dataEntryTimer" attachedToRef="dataEntryReview" cancelActivity="true">
      <timerEventDefinition><timeDuration>PT24H</timeDuration></timerEventDefinition>
    </boundaryEvent>
    ...`

const STEPS = [
  { label: 'Submit Application', role: 'Citizen', sla: '—', engine: 'Portal' },
  { label: 'Verify Documents', role: 'Talati', sla: '24h SLA', engine: 'Flowable BPMN 2.0' },
  { label: 'Final Approval', role: 'Mamlatdar', sla: '24h SLA', engine: 'Flowable BPMN 2.0' },
  { label: 'Generate Certificate → Notify Citizen', role: 'System', sla: '—', engine: 'PDF + Notification' },
]

export default function WorkflowPanel({ open, onClose }) {
  if (!open) return null

  return (
    <>
      <div className="wf-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="wf-panel dg-slide-right">
        <div className="wf-header">
          <span>⚙️ Workflow Config</span>
          <button type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="wf-sub">Caste Certificate — configured workflow (not hard-coded)</p>

        <div className="wf-swimlane">
          {STEPS.map((step, i) => (
            <div key={step.label} className="wf-step-wrap">
              {i > 0 && <div className="wf-arrow">↓</div>}
              <div className="wf-step">
                <div className="wf-step-title">{step.label}</div>
                <div className="wf-step-meta">Role: {step.role}</div>
                <div className="wf-step-meta">SLA: {step.sla}</div>
                <span className="wf-badge">{step.engine}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="wf-xml-label">BPMN XML (excerpt)</div>
        <pre className="wf-xml">{BPMN_SNIPPET}</pre>
        <p className="wf-powered">Powered by Flowable BPMN 2.0</p>
      </aside>
    </>
  )
}
