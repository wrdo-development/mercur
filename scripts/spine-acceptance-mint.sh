#!/usr/bin/env bash
# Spine acceptance helper (WRDO-180): authenticate as admin, mint a web-handoff
# link for a phone, print the shop.wrdo.co.za/c?t=<token> URL.
#
# Run AFTER the spine backend is deployed on Medusa Cloud AND the same-origin
# proxy is live on the storefront. Reads admin creds + backend URL from Doppler
# mercur/dev_personal. Usage:
#   command doppler run --project mercur --config dev_personal -- bash scripts/spine-acceptance-mint.sh <phone-e164>
# e.g. ... bash scripts/spine-acceptance-mint.sh 27761271676
set -euo pipefail

PHONE="${1:?usage: spine-acceptance-mint.sh <phone-e164>}"
BACKEND="${MEDUSA_BACKEND_URL:?MEDUSA_BACKEND_URL not set}"
EMAIL="${MEDUSA_ADMIN_EMAIL:?MEDUSA_ADMIN_EMAIL not set}"
PASS="${MEDUSA_ADMIN_PASSWORD:?MEDUSA_ADMIN_PASSWORD not set}"

echo "→ authenticating admin against ${BACKEND} ..."
TOKEN=$(curl -fsS -X POST "${BACKEND}/auth/user/emailpass" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [ -z "${TOKEN}" ]; then echo "✗ admin auth failed"; exit 1; fi
echo "✓ admin token acquired"

echo "→ minting handoff link for ${PHONE} ..."
RESP=$(curl -fsS -X POST "${BACKEND}/admin/spine/handoff" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"${PHONE}\"}")

echo "raw: ${RESP}"
URL=$(printf '%s' "${RESP}" | sed -n 's/.*"url":"\([^"]*\)".*/\1/p')
echo ""
echo "================ OPEN THIS ON PHONE + DESKTOP ================"
echo "${URL}"
echo "============================================================="
echo ""
echo "Acceptance: send from web -> appears in WhatsApp thread; send from"
echo "WhatsApp -> appears in web widget within ~3s. No CORS error on desktop."
