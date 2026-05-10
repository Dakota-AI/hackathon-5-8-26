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
EXEC_ARN=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("executionArn", ""))' <<< "$CREATE_RESPONSE")

STATUS=""
for _ in $(seq 1 40); do
  STATUS=$(aws stepfunctions describe-execution \
    --profile "$PROFILE" \
    --region "$REGION" \
    --execution-arn "$EXEC_ARN" \
    --query status \
    --output text)
  case "$STATUS" in
    SUCCEEDED|FAILED|TIMED_OUT|ABORTED) break ;;
  esac
  sleep 3
done

RUN_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID" -H "authorization: Bearer $ID_TOKEN")
EVENTS_RESPONSE=$(curl -sS -f "$API_URL/runs/$RUN_ID/events?limit=25" -H "authorization: Bearer $ID_TOKEN")

python3 - <<PY
import json
body=json.loads('''$RUN_RESPONSE''')
run=body.get('run', body)
events=json.loads('''$EVENTS_RESPONSE''').get('events', [])
print('HTTP_E2E_RUN_ID=' + '$RUN_ID')
print('HTTP_E2E_EXECUTION_STATUS=' + '$STATUS')
print('HTTP_E2E_RUN_STATUS=' + str(run.get('status')))
print('HTTP_E2E_EVENT_TYPES=' + ','.join(f"{event.get('seq')}:{event.get('type')}:{(event.get('payload') or {}).get('status','')}" for event in events))
print('HTTP_E2E_EVENT_COUNT=' + str(len(events)))
print('HTTP_E2E_HAS_ARTIFACT=' + str(any(event.get('type') == 'artifact.created' for event in events)))
assert '$STATUS' == 'SUCCEEDED'
assert run.get('status') == 'succeeded', run
assert len(events) >= 4, events
assert any(event.get('type') == 'artifact.created' for event in events), events
PY
