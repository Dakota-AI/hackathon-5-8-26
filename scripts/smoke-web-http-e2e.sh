#!/usr/bin/env bash
set -euo pipefail

PROFILE=${AWS_PROFILE:-agents-cloud-source}
REGION=${AWS_REGION:-us-east-1}
USER_POOL_ID=${NEXT_PUBLIC_AMPLIFY_USER_POOL_ID:-us-east-1_1UeU1hTME}
CLIENT_ID=${NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID:-3kq79rodc3ofjkulh0b31sfpos}
API_URL=${NEXT_PUBLIC_AGENTS_CLOUD_API_URL:-https://ajmonuqk61.execute-api.us-east-1.amazonaws.com}
WORKSPACE_ID=${AGENTS_CLOUD_E2E_WORKSPACE_ID:-workspace-web-e2e}
TEST_EMAIL="agents-cloud-e2e-$(date +%s)@example.com"
PASSWORD=$(python3 - <<'PY'
import secrets,string
alphabet=string.ascii_letters+string.digits+'!@#%^*()-_+'
while True:
    password=''.join(secrets.choice(alphabet) for _ in range(24))
    if any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password) and any(c in '!@#%^*()-_+' for c in password):
        print(password)
        break
PY
)

cleanup() {
  aws cognito-idp admin-delete-user \
    --profile "$PROFILE" \
    --region "$REGION" \
    --user-pool-id "$USER_POOL_ID" \
    --username "$TEST_EMAIL" >/dev/null 2>&1 || true
}
trap cleanup EXIT

aws cognito-idp admin-create-user \
  --profile "$PROFILE" \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --temporary-password "$PASSWORD" \
  --message-action SUPPRESS \
  --user-attributes Name=email,Value="$TEST_EMAIL" Name=email_verified,Value=true >/dev/null

aws cognito-idp admin-set-user-password \
  --profile "$PROFILE" \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --password "$PASSWORD" \
  --permanent >/dev/null

ID_TOKEN=$(AGENTS_CLOUD_TEST_USERNAME="$TEST_EMAIL" \
  AGENTS_CLOUD_TEST_PASSWORD="$PASSWORD" \
  NEXT_PUBLIC_AMPLIFY_REGION="$REGION" \
  NEXT_PUBLIC_AMPLIFY_USER_POOL_ID="$USER_POOL_ID" \
  NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID="$CLIENT_ID" \
  node apps/web/scripts/get-cognito-id-token.mjs)

RUN_SUFFIX=$(date +%s)
CREATE_BODY=$(python3 - <<PY
import json
print(json.dumps({
  "workspaceId": "$WORKSPACE_ID",
  "objective": "Web HTTP e2e smoke for durable run loop $RUN_SUFFIX",
  "idempotencyKey": "web-http-e2e-$RUN_SUFFIX"
}))
PY
)

CREATE_RESPONSE=$(curl -sS -f -X POST "$API_URL/runs" \
  -H "authorization: Bearer $ID_TOKEN" \
  -H "content-type: application/json" \
  --data "$CREATE_BODY")

RUN_ID=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["runId"])' <<< "$CREATE_RESPONSE")
EXEC_REF=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("executionArn", ""))' <<< "$CREATE_RESPONSE")
CREATE_STATUS=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' <<< "$CREATE_RESPONSE")

# The deployed resident-runner path returns an async Lambda dispatch reference
# instead of a Step Functions execution ARN. Poll the durable Control API ledger;
# it is the source of truth for both stateless SFN and resident-runner dispatch.
RUN_RESPONSE=""
EVENTS_RESPONSE=""
ARTIFACTS_RESPONSE=""
for _ in $(seq 1 90); do
  RUN_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID" -H "authorization: Bearer $ID_TOKEN")
  EVENTS_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID/events?limit=50" -H "authorization: Bearer $ID_TOKEN")
  ARTIFACTS_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID/artifacts" -H "authorization: Bearer $ID_TOKEN")
  RUN_STATUS=$(python3 -c 'import json,sys; body=json.load(sys.stdin); run=body.get("run", body); print(run.get("status", ""))' <<< "$RUN_RESPONSE")
  HAS_ARTIFACT_EVENT=$(python3 -c 'import json,sys; print(any(e.get("type") == "artifact.created" for e in json.load(sys.stdin).get("events", [])))' <<< "$EVENTS_RESPONSE")
  ARTIFACT_COUNT=$(python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("artifacts", [])))' <<< "$ARTIFACTS_RESPONSE")
  if [[ "$RUN_STATUS" =~ ^(succeeded|failed|cancelled|timed_out)$ ]] && [[ "$HAS_ARTIFACT_EVENT" == "True" ]] && [[ "$ARTIFACT_COUNT" -gt 0 ]]; then
    break
  fi
  sleep 3
done

DOWNLOAD_RESPONSE="{}"
ARTIFACT_ID=$(python3 -c 'import json,sys; items=json.load(sys.stdin).get("artifacts", []); print(items[0].get("artifactId", "") if items else "")' <<< "$ARTIFACTS_RESPONSE")
if [[ -n "$ARTIFACT_ID" ]]; then
  DOWNLOAD_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID/artifacts/$ARTIFACT_ID/download" -H "authorization: Bearer $ID_TOKEN")
fi

python3 - <<PY
import json
create=json.loads('''$CREATE_RESPONSE''')
run_body=json.loads('''$RUN_RESPONSE''')
run=run_body.get('run', run_body)
events=json.loads('''$EVENTS_RESPONSE''').get('events', [])
artifacts=json.loads('''$ARTIFACTS_RESPONSE''').get('artifacts', [])
download=json.loads('''$DOWNLOAD_RESPONSE''')
execution_ref='$EXEC_REF'
event_summary=','.join(f"{event.get('seq')}:{event.get('type')}:{(event.get('payload') or {}).get('status','')}" for event in events)
print('HTTP_E2E_RUN_ID=' + '$RUN_ID')
print('HTTP_E2E_CREATE_STATUS=' + '$CREATE_STATUS')
print('HTTP_E2E_EXECUTION_REF=' + execution_ref)
print('HTTP_E2E_RUN_STATUS=' + str(run.get('status')))
print('HTTP_E2E_EVENT_TYPES=' + event_summary)
print('HTTP_E2E_EVENT_COUNT=' + str(len(events)))
print('HTTP_E2E_ARTIFACT_COUNT=' + str(len(artifacts)))
print('HTTP_E2E_FIRST_ARTIFACT_ID=' + ('$ARTIFACT_ID'))
print('HTTP_E2E_HAS_DOWNLOAD_URL=' + str(bool(download.get('downloadUrl') or download.get('url'))))
assert execution_ref.startswith(('async-lambda:', 'arn:aws:states:')), execution_ref
assert run.get('status') == 'succeeded', run
assert len(events) >= 4, events
assert any(event.get('type') == 'artifact.created' for event in events), events
assert artifacts, artifacts
assert download.get('downloadUrl') or download.get('url'), download
PY
