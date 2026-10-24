#!/bin/bash
# seed_demo_task_queue.sh — creates demo workflow tasks for officer portal Task Queue.
# Run after service restarts or Postgres recovery when task lists are empty.
set -e

PROXY="http://127.0.0.1"
EXEC=(kubectl exec -n egov deployment/officer-portal -- sh -c)

post_json() {
  local path="$1"
  local body="$2"
  "${EXEC[@]}" "wget -q -O- --header='Content-Type: application/json' --post-data='$body' '${PROXY}${path}'"
}

post_empty() {
  local path="$1"
  "${EXEC[@]}" "wget -q -O- --post-data='' '${PROXY}${path}'"
}

echo "==> Seeding Caste Certificate (Priya Patel → Talati Verification)..."
CASTE=$(post_json "/caste-certificate-service/v1/applications" \
  '{"applicantName":"Priya Patel","casteCode":"OBC","tenantId":"pg","aadhaarRef":"XXXX-XXXX-1001"}')
CASTE_REF=$(echo "$CASTE" | sed -n 's/.*"engineRef":"\([^"]*\)".*/\1/p')
echo "    Created $CASTE_REF"
post_empty "/caste-certificate-service/v1/applications/${CASTE_REF}/approve" >/dev/null
echo "    Advanced to Talati Verification"

echo "==> Seeding Caste Certificate (Data Entry step for demo officer)..."
post_json "/caste-certificate-service/v1/applications" \
  '{"applicantName":"Shreya Patel","casteCode":"OBC","tenantId":"pg","aadhaarRef":"XXXX-XXXX-1003"}' >/dev/null
echo "    Created Shreya application at Data Entry Review"

echo "==> Seeding Pension (Savitaben → Revenue Officer)..."
post_json "/pension-service/v1/applications" \
  '{"applicantName":"Savitaben Patel","pensionType":"Old Age Pension","aadhaarRef":"XXXX-XXXX-1005","familyId":"a1000000-0000-0000-0000-000000000001","tenantId":"pg"}' >/dev/null
echo "    Created Savitaben pension application"

echo "==> Seeding Family Member Change (Talati Verification)..."
post_json "/family-member-service/v1/applications" \
  '{"familyId":"a1000000-0000-0000-0000-000000000001","changeType":"ADD","personName":"Newborn Patel","personId":"","dob":"2026-01-15","gender":"M","relationshipToHead":"SON","occupation":"Infant","annualIncome":"0","casteCategory":"OBC","mobile":"9876541099","reason":"Birth registration","tenantId":"pg"}' >/dev/null
echo "    Created family member change application"

echo "==> Seeding Scheme Application (Income Officer step)..."
post_json "/scheme-application-service/v1/applications" \
  '{"schemeId":"a1000001-0000-0000-0000-000000000002","schemeName":"Post-Matric OBC Scholarship","familyId":"a1000000-0000-0000-0000-000000000001","aadhaarRef":"XXXX-XXXX-1003","declaredIncome":132000,"tenantId":"pg"}' >/dev/null
echo "    Created scheme application"

echo "==> Setting Priya caste cert SLA badge (23h old)..."
POSTGRES_POD=$(kubectl get pods -n egov -l app=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POSTGRES_POD" -n egov -- psql -U egovuser -d egov_db -c "
  UPDATE caste_cert.act_ru_task
  SET create_time_ = NOW() - INTERVAL '23 hours'
  WHERE name_ = 'Talati Verification'
    AND proc_inst_id_ IN (
      SELECT v.proc_inst_id_ FROM caste_cert.act_ru_variable v
      WHERE v.name_ = 'applicantName' AND v.text_ = 'Priya Patel'
    );" 2>/dev/null || true

echo ""
echo "==> Task counts:"
"${EXEC[@]}" "for p in caste-certificate-service pension-service family-member-service scheme-application-service; do echo -n \"\$p: \"; wget -q -O- \"${PROXY}/\${p}/v1/applications\" | wc -c; done"

echo ""
echo "✅ Demo task queue seeded. Login hints:"
echo "   talati/officer123       → Priya caste cert (red SLA) + family member change"
echo "   data.entry/officer123   → Shreya caste cert"
echo "   revenue/officer123      → Savitaben pension"
echo "   scheme.dept/officer123  → (approve income step first) scheme application"
echo "   dept.admin/officer123   → all tasks"
