#!/usr/bin/env bash
set -euo pipefail

PROFILE=${AWS_PROFILE:-agents-cloud-source}
REGION=${AWS_REGION:-us-east-1}
USER_POOL_ID=${NEXT_PUBLIC_AMPLIFY_USER_POOL_ID:-us-east-1_1UeU1hTME}
CLIENT_ID=${NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID:-3kq79rodc3ofjkulh0b31sfpos}
TEST_EMAIL="agents-cloud-ws-e2e-$(date +%s)@example.com"
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

aws cognito-idp admin-add-user-to-group \
  --profile "$PROFILE" \
  --region "$REGION" \
  --user-pool-id "$USER_POOL_ID" \
  --username "$TEST_EMAIL" \
  --group-name agents-cloud-user >/dev/null

ID_TOKEN=$(AGENTS_CLOUD_TEST_USERNAME="$TEST_EMAIL" \
  AGENTS_CLOUD_TEST_PASSWORD="$PASSWORD" \
  NEXT_PUBLIC_AMPLIFY_REGION="$REGION" \
  NEXT_PUBLIC_AMPLIFY_USER_POOL_ID="$USER_POOL_ID" \
  NEXT_PUBLIC_AMPLIFY_USER_POOL_CLIENT_ID="$CLIENT_ID" \
  node apps/web/scripts/get-cognito-id-token.mjs)

AGENTS_CLOUD_ID_TOKEN="$ID_TOKEN" node scripts/smoke-websocket-run-e2e.mjs
