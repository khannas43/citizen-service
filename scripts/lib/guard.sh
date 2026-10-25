# shellcheck shell=bash
# Safety guard for Citizen-Services scripts. Source this; never execute it.
# Citizen-Services must never touch the DG2.0 demo (namespace "egov").
CS_NAMESPACE="${CS_NAMESPACE:-citizen}"
if [ "$CS_NAMESPACE" = "egov" ]; then
  echo "REFUSING: 'egov' is the DG2.0 demo namespace. Citizen-Services uses 'citizen'." >&2
  exit 1
fi
kubectl() {
  local a
  for a in "$@"; do
    case "$a" in
      egov|egov/*|*.egov.svc*|*egov_db*|*egovuser*)
        echo "REFUSING kubectl call that references DG2.0 ('$a')." >&2
        return 1 ;;
    esac
  done
  command kubectl "$@"
}
export -f kubectl 2>/dev/null || true
