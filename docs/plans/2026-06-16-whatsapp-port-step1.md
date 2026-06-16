# WhatsApp Module Port → Mercur (Step 1) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (this session) or superpowers:executing-plans to implement task-by-task.

**Goal:** Get WRDO's WhatsApp webhook live on the Mercur production backend (`wrdo-api.medusajs.app`) — verify handshake → receive message → Redis-backed reply — then register it in Meta and prove it end-to-end by messaging the WABA from a real phone.

**Architecture:** Port the *service-only* WhatsApp module (zero DB models, Redis + HTTP) from `product-tribe/apps/backend` into the Mercur backend (`~/dev/mercur-backend`, a bun monorepo, deployed via git push to `main` on Medusa Cloud). The webhook pipeline degrades gracefully without the data-stack modules (provider lookup → `[]`), so NO database, NO migrations, NO tribe-directory/booking/listing. The one real gotcha: `create-pipeline.ts` *imports* `tribe-directory` at module-load (not lazily), so that import must be severed/stubbed or the build breaks even though runtime degrades fine.

**Tech Stack:** Medusa v2 (Mercur pins 2.13.4; source is 2.15.3 — porting *down*, no 2.14/2.15-only APIs are used by this module), TypeScript, bun, Redis, Meta WhatsApp Cloud API. Doppler config `wrdo/prd_tribe` holds the 5 WABA creds (permanent token) already.

**Out of scope (explicit — a LATER phase, do not touch):** tribe-directory, tribe-listing, tribe-booking, tribe-loyalty, wrdo-user, identity-registration, the conversation spine (`conversation_threads`/`messages`), ALL Supabase migrations, and the schema-dualism reconciliation (UUID-vs-text IDs, RLS, pg triggers). This plan ends at "a real phone gets a reply." Booking/provider flows come after the data-stack migration.

---

## Pre-flight facts (verified 2026-06-16)

- **WhatsApp module = service-only.** `whatsapp.module.ts` registers `Module('tribe_whatsapp', { service: MessageSenderService })`. **Zero `model.define`, zero migrations, zero tables.**
- **Webhook route** `src/api/webhooks/whatsapp/route.ts` imports only `createWebhookPipeline` + `verifyHmac` from `modules/whatsapp`. GET verify is fully self-contained (`WHATSAPP_VERIFY_TOKEN` + `timingSafeEqual`). It is OUTSIDE `/store`, so no publishable-key middleware (that was the 404/400 confusion — the live Mercur backend simply doesn't have this route yet).
- **The gotcha:** `create-pipeline.ts` has top-level imports `import { TRIBE_DIRECTORY_MODULE } from '../tribe-directory'` and `listProvidersByService` + type `IProviderDirectory`. Runtime use is try/catch'd (degrades to `[]`), but the *import* must resolve at build. → Task 4 severs it with a local stub.
- **create-pipeline real deps that MUST come:** `clients/ai-client/ai-client` (stub), `tribe-sessions/conversation-state.service` (Redis-only), `flow-engine/*`, `language-detection/*`, `redis-adapter`, `whatsapp.logger`, and the in-module services. Plus `types/*`.
- **Mercur has NO Redis** (verified — no redis ref in `apps/api`, no `REDIS_URL` in Doppler). → Task 1 provisions it.
- **Mercur module registration** lives in `apps/api/medusa-config.ts` `modules: [...]` (uses `resolve:` entries like `@mercurjs/core/modules/admin-ui`).
- **Deploy:** git push to `main` of `wrdo-development/mercur` → Medusa Cloud auto-builds. No CLI deploy. Cold-start: first request after deploy is slow (warm it before judging).
- **Branch:** work on `feat/whatsapp-port` off Mercur's `main`; merge to `main` triggers the deploy.

---

## Task 1: Provision Redis + wire REDIS_URL (the hard dependency)

**This is not code — it's the gating infra task. Nothing downstream works without it.**

**Step 1: Check Medusa Cloud for a Redis add-on.**
In the Medusa Cloud dashboard for the `wrdo-api` project → Infrastructure/Add-ons. Medusa Cloud offers managed Redis. If present, provision it and copy the connection URL. If NOT available on the plan, provision external Redis (Upstash free tier is the fast SA-friendly option: `https://upstash.com` → create a Redis DB in `eu-` region → copy the `rediss://` URL).

**Step 2: Set REDIS_URL in Doppler (Alwyn does this — secret).**
```
# Alwyn, in Doppler wrdo/prd_tribe:
REDIS_URL = <the rediss:// connection string>
```
Then verify presence (names only, never value):
```bash
command doppler secrets --project wrdo --config prd_tribe --json | python3 -c "import sys,json;d=json.load(sys.stdin);print('REDIS_URL', 'SET' if (d.get('REDIS_URL',{}) or {}).get('computed','').strip() else 'MISSING')"
```
Expected: `REDIS_URL SET`

**Step 3: Confirm Medusa Cloud injects Doppler env into the build.**
Verify the Cloud project reads from Doppler `prd_tribe` (or that the 5 WABA keys + REDIS_URL are mirrored into Cloud's own env). If Cloud uses its own env panel (not Doppler), the 6 keys (5 WABA + REDIS_URL) must be set THERE too. This is the silent-failure trap: keys in Doppler ≠ keys in the deployed container unless Cloud is wired to Doppler.

**Step 4: Commit nothing (infra only). Record outcome in the plan checklist.**

⚠️ **Gate:** do not proceed past here until `REDIS_URL` is reachable by the deployed Mercur backend.

---

## Task 2: Branch + copy the WhatsApp module files (no wiring yet)

**Files:**
- Create (copy from `~/dev/product-tribe/apps/backend/src/`): `apps/api/src/modules/whatsapp/**` (all 54 files), `apps/api/src/modules/tribe-sessions/**` (Redis path only — keep the dir, its 1 model is unused by the webhook), `apps/api/src/clients/ai-client/**`, `apps/api/src/types/**` (whatsapp.*, tribe-flows, ai-client, booking, events.*)
- Create: `apps/api/src/api/webhooks/whatsapp/route.ts`

**Step 1: Branch off Mercur main.**
```bash
cd ~/dev/mercur-backend && git fetch origin -q && git checkout main && git pull -q && git checkout -b feat/whatsapp-port
```

**Step 2: Copy the module trees verbatim (preserving structure).**
```bash
SRC=~/dev/product-tribe/apps/backend/src
DST=~/dev/mercur-backend/apps/api/src
mkdir -p "$DST/modules" "$DST/clients" "$DST/types" "$DST/api/webhooks/whatsapp"
cp -R "$SRC/modules/whatsapp" "$DST/modules/whatsapp"
cp -R "$SRC/modules/tribe-sessions" "$DST/modules/tribe-sessions"
cp -R "$SRC/clients/ai-client" "$DST/clients/ai-client"
cp "$SRC/api/webhooks/whatsapp/route.ts" "$DST/api/webhooks/whatsapp/route.ts"
# types: copy only what the module imports (whatsapp.*, tribe-flows, ai-client, booking, events.*)
for f in whatsapp.incoming.types whatsapp.outgoing.types tribe-flows.types ai-client.types booking.types events.types; do
  [ -f "$SRC/types/$f.ts" ] && cp "$SRC/types/$f.ts" "$DST/types/$f.ts"
done
```

**Step 3: Inventory what landed + what type files are actually referenced.**
```bash
cd ~/dev/mercur-backend/apps/api/src
find modules/whatsapp modules/tribe-sessions clients/ai-client -type f | wc -l   # ~expect 70+
# find any type imports the copy missed:
rg -oh "from '\.\..*/types/[a-z.-]+'" modules/whatsapp | sort -u
```
If the rg surfaces a `types/X` not yet copied, copy it too. Repeat until no missing type import.

**Step 4: Commit the raw copy (build will NOT pass yet — that's expected).**
```bash
git add apps/api/src/modules/whatsapp apps/api/src/modules/tribe-sessions apps/api/src/clients apps/api/src/types apps/api/src/api/webhooks
git commit -m "chore(whatsapp): copy WhatsApp module + tribe-sessions + types from product-tribe (pre-wiring)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Resolve import paths + the tribe-directory severance (make it compile)

**Files:**
- Modify: `apps/api/src/modules/whatsapp/create-pipeline.ts` (sever tribe-directory imports)
- Create: `apps/api/src/modules/whatsapp/provider-finder.stub.ts`
- Modify: any file whose relative import paths broke in the copy

**Step 1: Find every broken import (build dry-run).**
```bash
cd ~/dev/mercur-backend && bun run --filter @mercur/api type-check 2>&1 | grep -iE "cannot find|TS2307|module not found" | head -40
```
(If the filter name differs, use `cd apps/api && bunx tsc --noEmit`.) Expected: errors pointing at `../tribe-directory`, possibly `../../clients`, possibly missing `types/*`.

**Step 2: Create the provider-finder stub (the gotcha fix).**
`create-pipeline.ts` imports at top-level:
```ts
import { TRIBE_DIRECTORY_MODULE } from '../tribe-directory';
import { listProvidersByService } from '../tribe-directory/provider.repository';
import type { IProviderDirectory } from '../tribe-directory/provider.types';
```
We are NOT bringing tribe-directory. Create `apps/api/src/modules/whatsapp/provider-finder.stub.ts`:
```ts
// Step-1 stub: tribe-directory is not yet ported. The pipeline already degrades
// to an empty provider list at runtime (try/catch); this stub satisfies the
// build-time import so a WhatsApp message still verifies + receives + replies.
// REPLACE with the real tribe-directory import when the data-stack lands (later phase).
export const TRIBE_DIRECTORY_MODULE = 'tribe_directory';
export type IProviderDirectory = { listProvidersByService?: unknown };
export async function listProvidersByService(): Promise<never[]> {
  return [];
}
```

**Step 3: Repoint create-pipeline's imports to the stub.**
In `apps/api/src/modules/whatsapp/create-pipeline.ts` replace the three `../tribe-directory*` import lines with:
```ts
import { TRIBE_DIRECTORY_MODULE, listProvidersByService, type IProviderDirectory } from './provider-finder.stub';
```
Leave the runtime providerFinder logic untouched (it already try/catches and returns `[]`). Add a comment at the call site: `// Step-1: provider lookup stubbed to [] until tribe-directory ports (later phase)`.

**Step 4: Fix any remaining relative-path breaks.**
Common one: `clients/ai-client` was at `src/clients` in source and is now at `apps/api/src/clients` — relative imports like `../../clients/ai-client/ai-client` should still resolve since the tree depth matches. If type-check shows path errors, fix each to the new location. Re-run Step 1's type-check until zero "cannot find module" errors.

**Step 5: Type-check passes.**
```bash
cd ~/dev/mercur-backend/apps/api && bunx tsc --noEmit 2>&1 | tail -5
```
Expected: no errors from the whatsapp module. (Pre-existing Mercur errors, if any, are not ours — compare against a clean `git stash` of our files if unsure.)

**Step 6: Commit.**
```bash
git add apps/api/src/modules/whatsapp
git commit -m "fix(whatsapp): stub tribe-directory import for Step-1 standalone port

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Register the module + verify the env contract

**Files:**
- Modify: `apps/api/medusa-config.ts` (add the whatsapp + tribe-sessions module resolves)

**Step 1: Register both modules in Mercur's config.**
In `apps/api/medusa-config.ts`, inside `modules: [ ... ]`, add:
```ts
{ resolve: './src/modules/whatsapp' },
{ resolve: './src/modules/tribe-sessions' },
```
(Match the existing entry style. The `whatsapp` module's default export is `Module('tribe_whatsapp', {...})` so it self-names.)

**Step 2: Confirm the env vars the module reads exist in the deploy env.**
The module reads (grep to confirm the exact set):
```bash
cd ~/dev/mercur-backend/apps/api/src/modules/whatsapp && rg -oh "process\.env\.[A-Z_]+" -r '$0' . | sort -u
```
Expected set includes: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `REDIS_URL` (via redis-adapter / conversation-state). Confirm every one is present in the deployed env (Doppler `prd_tribe` AND/OR Medusa Cloud env per Task 1 Step 3).

**Step 3: Local boot smoke (if a local Mercur boot is feasible).**
```bash
cd ~/dev/mercur-backend && bun run --filter @mercur/api dev   # or apps/api: bun run dev
# in another shell, once booted:
curl -s "http://localhost:9000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=LOCALTEST" -w ' [%{http_code}]'
```
Expected: echoes `LOCALTEST [200]`. And with a wrong token → 403, no echo.
If local boot needs the full Mercur DB/seed and is impractical, skip to deploy (Task 5) and test against the live URL — note that in the checklist.

**Step 4: Commit.**
```bash
git add apps/api/medusa-config.ts
git commit -m "feat(whatsapp): register tribe_whatsapp + tribe-sessions modules in Mercur

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Deploy to Mercur production + confirm the route is live

**Step 1: Push the branch, open PR, merge to main (main → Cloud auto-deploys).**
```bash
cd ~/dev/mercur-backend && git push -u origin feat/whatsapp-port
gh pr create --repo wrdo-development/mercur --base main --title "feat(whatsapp): port WhatsApp webhook module (Step 1)" --body "Ports WRDO's service-only WhatsApp module into Mercur to unblock the live WhatsApp Flow test. No DB, no migrations, tribe-directory stubbed (degrades to []). Provisions Redis. Closes the /webhooks/whatsapp 404."
# after CI + review: merge to main
```

**Step 2: Wait for Medusa Cloud build → Ready (watch the dashboard Deployments list for the new commit going Active).**

**Step 3: Warm the backend, then confirm the route is LIVE (the thing that was 404).**
```bash
curl -s -m 25 -o /dev/null -w 'health %{http_code}\n' https://wrdo-api.medusajs.app/health
# verify handshake — WRONG token must NOT echo:
curl -s -m 20 "https://wrdo-api.medusajs.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=NOPE" -w ' [%{http_code}]'
```
Expected: a 403/empty for the wrong token (NOT a 404 — 404 means the route still isn't deployed; if so, the build didn't pick up our files — debug the Cloud build log before going further).

**Step 4: Confirm the CORRECT token echoes (this proves the env var landed in the container).**
This needs the real `WHATSAPP_VERIFY_TOKEN`. Alwyn runs it (or it's done as the Meta registration in Task 6, which does exactly this):
```bash
# Alwyn, with the real token:
curl -s "https://wrdo-api.medusajs.app/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<REAL_VERIFY_TOKEN>&hub.challenge=ECHOTEST"
```
Expected: prints `ECHOTEST`. If it prints nothing / 403, the `WHATSAPP_VERIFY_TOKEN` in the container ≠ the one you're testing with → fix the env (Task 1 Step 3).

---

## Task 6: Register the webhook in Meta + the live phone test (ACCEPTANCE)

**This is the acceptance criterion. Alwyn-driven (Meta dashboard + real phone).**

**Step 1: Register the webhook URL in Meta.**
Meta App Dashboard → WhatsApp → Configuration → Webhook:
- Callback URL: `https://wrdo-api.medusajs.app/webhooks/whatsapp`
- Verify token: the real `WHATSAPP_VERIFY_TOKEN` (must match Doppler/container exactly).
- Click **Verify and Save** → Meta fires the GET handshake → our route echoes `hub.challenge` → Meta shows green/verified. (If it fails: the verify-token mismatch or the route 404 — re-check Task 5.)
- Subscribe to the `messages` webhook field.

**Step 2: The live round-trip test (the whole point).**
From a real phone, message the WABA number:
1. Send "hi" (or any text) to the WhatsApp Business number.
2. Meta POSTs to `https://wrdo-api.medusajs.app/webhooks/whatsapp`.
3. Our pipeline: HMAC-verify → idempotency → (provider lookup stubbed → []) → reply via `MessageSenderService`.
4. **Expected: a reply arrives in WhatsApp on the phone.**

**Step 3: Watch the runtime logs during the test (diagnosis if no reply).**
Medusa Cloud dashboard → **Runtime logs** while messaging. Look for: webhook received, HMAC pass, pipeline ran, send attempted. Common no-reply causes: `WHATSAPP_ACCESS_TOKEN` wrong/expired (it's the permanent one — should be fine), `WHATSAPP_PHONE_NUMBER_ID` mismatch, Redis unreachable (idempotency/session write fails), or the 24h-session-window rule (a business-initiated reply to a never-messaged number needs a template; a reply WITHIN 24h of the user's inbound message is free-form — since the user just messaged us, free-form reply is allowed).

**ACCEPTANCE: a real phone sends a WhatsApp message to the WABA and receives WRDO's reply, served by the Mercur backend.** That closes Step 1.

---

## Done = Step 1 acceptance met. Then (LATER, separate plans):
- **Step 2:** the encrypted Flows route (`webhooks/whatsapp-flow`) if native Flows are needed.
- **Step 3 (the swamp):** decide schema ownership (Medusa-generated migrations vs re-homed SQL), port tribe-directory + tribe-listing, build the conversation spine IN Mercur. This is where the real booking/provider/continuity work lives.
- **Step 4:** booking, loyalty, user, payments, admin routes.

## Risks & notes
- **Silent env gap (highest risk):** keys in Doppler ≠ keys in the deployed container unless Medusa Cloud is wired to Doppler. Task 1 Step 3 + Task 5 Step 4 exist to catch this — a wrong/missing verify token makes Meta's "Verify and Save" fail with a generic error that looks like a code bug but isn't.
- **bun monorepo:** Mercur uses `bun` + turbo, not pnpm. Use `bun`/`bunx` commands; respect the existing `bun.lock`. Don't introduce a second lockfile (the WRDO-171 memory flags a dual-lockfile gotcha).
- **Cold start:** first request post-deploy is slow — always warm `/health` before judging a 404/timeout.
- **Version port-down:** source files are 2.15.3; Mercur is 2.13.4. The module uses only stable v2 APIs (`Module`, `MedusaRequest/Response`, `ContainerRegistrationKeys`, `model` isn't used here). If any 2.14/2.15-only import appears in type-check, replace with the 2.13 equivalent — note it.
