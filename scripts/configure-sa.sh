#!/usr/bin/env bash
# Configure the LIVE Medusa Cloud backend for South Africa via the admin API.
# Cloud ignores package.json predeploy and exposes no remote exec, so we drive
# the admin REST API directly. Idempotent. Creds pulled from Doppler.
#   Usage: bash scripts/configure-sa.sh
set -euo pipefail

API="https://wrdo-api.medusajs.app"
EM=$(command doppler secrets get MEDUSA_ADMIN_EMAIL --project mercur --config dev_personal --plain)
PW=$(command doppler secrets get MEDUSA_ADMIN_PASSWORD --project mercur --config dev_personal --plain)

TOKEN=$(curl -s -X POST "$API/auth/user/emailpass" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EM\",\"password\":\"$PW\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
H_AUTH="Authorization: Bearer $TOKEN"
H_JSON="Content-Type: application/json"

echo "→ authenticated as $EM"

# --- 1. Store currency → ZAR (keep it the single supported currency) ---
STORE_ID=$(curl -s "$API/admin/stores" -H "$H_AUTH" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['stores'][0]['id'])")
curl -s -X POST "$API/admin/stores/$STORE_ID" -H "$H_AUTH" -H "$H_JSON" \
  -d '{"supported_currencies":[{"currency_code":"zar","is_default":true}]}' >/dev/null
echo "→ store currency set to ZAR ($STORE_ID)"

# --- 2. South Africa region (idempotent) ---
HAS_SA=$(curl -s "$API/admin/regions" -H "$H_AUTH" \
  | python3 -c "import json,sys;print(any(r['currency_code']=='zar' for r in json.load(sys.stdin).get('regions',[])))")
if [ "$HAS_SA" = "True" ]; then
  echo "→ South Africa region already exists, skipping"
else
  curl -s -X POST "$API/admin/regions" -H "$H_AUTH" -H "$H_JSON" \
    -d '{"name":"South Africa","currency_code":"zar","countries":["za"],"payment_providers":["pp_system_default"]}' \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print('→ created region:',d['region']['name'],d['region']['currency_code'])"
fi

# --- 3. Publishable key linked to the default sales channel (idempotent) ---
SC_ID=$(curl -s "$API/admin/sales-channels" -H "$H_AUTH" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['sales_channels'][0]['id'])")
PK=$(curl -s "$API/admin/api-keys?type=publishable" -H "$H_AUTH" \
  | python3 -c "import json,sys;d=json.load(sys.stdin)['api_keys'];print(d[0]['id'] if d else '')")
if [ -n "$PK" ]; then
  curl -s -X POST "$API/admin/api-keys/$PK/sales-channels" -H "$H_AUTH" -H "$H_JSON" \
    -d "{\"add\":[\"$SC_ID\"]}" >/dev/null 2>&1 || true
  echo "→ publishable key $PK linked to sales channel $SC_ID"
fi

echo ""
echo "=== FINAL STATE ==="
echo -n "regions: "; curl -s "$API/admin/regions" -H "$H_AUTH" | python3 -c "import json,sys;print([(r['name'],r['currency_code']) for r in json.load(sys.stdin)['regions']])"
echo -n "publishable token: "; curl -s "$API/admin/api-keys?type=publishable" -H "$H_AUTH" | python3 -c "import json,sys;d=json.load(sys.stdin)['api_keys'];print(d[0]['token'] if d else 'NONE')"
