#!/usr/bin/env bash
set -euo pipefail

PROFILE="${AWS_PROFILE:-personal}"
REGION="${AWS_REGION:-us-east-1}"
PREFIX="${SSM_PREFIX:-/ai-childrens-book/dev}"

SECRET_KEYS=(
  "sendgrid_api_key"
  "openai_api_key"
  "anthropic_api_key"
  "jwt_signing_secret"
  "stripe_secret_key"
  "stripe_webhook_secret"
)

echo "Migrating secret params to SecureString (profile=${PROFILE}, region=${REGION}, prefix=${PREFIX})"

for key in "${SECRET_KEYS[@]}"; do
  name="${PREFIX}/${key}"
  type=$(AWS_PROFILE="${PROFILE}" AWS_REGION="${REGION}" aws ssm describe-parameters \
    --parameter-filters "Key=Name,Option=Equals,Values=${name}" \
    --query "Parameters[0].Type" --output text 2>/dev/null || true)

  if [[ -z "${type}" || "${type}" == "None" ]]; then
    echo "SKIP ${name} (not found)"
    continue
  fi

  if [[ "${type}" == "SecureString" ]]; then
    echo "OK   ${name} already SecureString"
    continue
  fi

  value=$(AWS_PROFILE="${PROFILE}" AWS_REGION="${REGION}" aws ssm get-parameter \
    --name "${name}" --with-decryption --query "Parameter.Value" --output text)

  AWS_PROFILE="${PROFILE}" AWS_REGION="${REGION}" aws ssm put-parameter \
    --name "${name}" \
    --type "SecureString" \
    --value "${value}" \
    --overwrite >/dev/null

  echo "DONE ${name} converted from ${type} -> SecureString"
done

echo "Migration complete."
