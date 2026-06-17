# wrdo-user persistence: create_user on registration complete — design

**Date:** 2026-06-17
**Ticket:** WRDO-179 (create before PR; relates to WRDO-169, WRDO-178)
**Executes:** Step 1 of `docs/plans/2026-06-16-data-stack-port-step2.md`
(port `wrdo-user` + `user_channel_identity`) **+** the wiring that fires it from
the WhatsApp registration flow.

## Problem

Registration now confirms the name (WRDO-169) and completes through consent, but
`request_consent` success returns `{ completed: true, cleared: true }` and the
collected data evaporates with the cleared Redis state
(`registration.flow.ts:346-356`). **No user is persisted.** Everything downstream
(profile, bookings, loyalty, the conversation spine) needs a real user record.

## Approach — 3 layers, bottom-up

### Layer 1: port the `wrdo-user` Medusa module

New module `apps/api/src/modules/wrdo-user/` ported verbatim from
product-tribe (`apps/backend/src/modules/wrdo-user/`):

- `models/wrdo-user.ts` — `model.define('wrdo_users', { id, display_name?,
  marketing_consent=false, service_consent=true, is_active=true,
  registration_state='pending', metadata? })`
- `models/user-channel-identity.ts` — `model.define('user_channel_identity',
  { id, user_id, channel enum[whatsapp,telegram,messenger,web], channel_user_id,
  display_name_on_channel?, is_verified=false, metadata? })`
- `service.ts` — `MedusaService({ WrdoUser, UserChannelIdentity })`
- `index.ts` — `Module(WRDO_USER_MODULE='wrdo_user', { service })`
- A thin `WrdoUserService` wrapper exposing `getOrCreateByChannelIdentity`
  (idempotent under `UNIQUE(channel, channel_user_id)`) and `getByChannelIdentity`.

**Dropped from the port (clean install — plan line 38):**
- `mirror.ts` / `dualWriteMirrorFromTribeUser` — no legacy `tribe_users` in mercur.
- Hand-written Supabase SQL: RLS policies + `set_updated_at` triggers. Medusa
  manages `updated_at`; nothing outside Medusa reads this DB, so RLS is moot.

### Layer 2: predeploy-safe migration (THE trap)

The locked rule (it bit us once — WhatsApp bug #1): a registered module with a
model but **no generated migration** fails `medusa db:migrate` → whole Cloud
build fails. So:

1. Register `./src/modules/wrdo-user` in `medusa-config.ts`.
2. `medusa db:generate wrdo_user` → commit the generated migration.
3. **Verify predeploy green against a scratch DB** (`medusa db:migrate` on a
   throwaway pg, the boot-smoke method) BEFORE the PR.

Model + migration land in the SAME commit. Never one without the other.

### Layer 3: wire create_user into the flow

- Inject an optional `onRegistrationComplete` persistence callback into
  `RegistrationFlowHandler` (DI, same shape as `conversationStateService`).
- At `request_consent` success, call it with the collected data, THEN return the
  welcome message.
- Map: `display_name` ← name; `service_consent`=true, `marketing_consent` ←
  (false for now — consent copy is service-only); `registration_state`='complete';
  `metadata` ← `{ role, interests, selfieProvided, locationProvided }`
  (TODO(plan-step-2/3): migrate role→identity-registration,
  interests→tribe-engagement when those tables land).
- Channel identity: `getOrCreateByChannelIdentity('whatsapp', phone,
  { displayName: name, channelDisplayName: contactName })`.

## Decisions (confirmed with Alwyn)

1. **Failure mode: always welcome, persist best-effort.** Show "You're all set!
   🎉" regardless. On DB failure: `console.error` loudly (reaches Cloud logs, like
   the pipeline fix) and DO NOT block. Idempotent `getOrCreate` means the next
   message retries cleanly. Never make a friend re-register over our hiccup.
2. **Extra fields → `wrdo_users.metadata` JSON** this PR. No data lost; dedicated
   tables are plan steps 2-3.

## Files

| File | Change |
|---|---|
| `apps/api/src/modules/wrdo-user/models/wrdo-user.ts` | new (port) |
| `apps/api/src/modules/wrdo-user/models/user-channel-identity.ts` | new (port) |
| `apps/api/src/modules/wrdo-user/service.ts` | new — MedusaService |
| `apps/api/src/modules/wrdo-user/wrdo-user.service.ts` | new — getOrCreate/get wrapper |
| `apps/api/src/modules/wrdo-user/index.ts` | new — Module() |
| `apps/api/src/modules/wrdo-user/migrations/Migration*.ts` | generated, committed |
| `apps/api/medusa-config.ts` | register module |
| `apps/api/src/modules/tribe-sessions/registration.flow.ts` | `request_consent` → invoke persist callback (best-effort) before welcome |
| `apps/api/src/modules/whatsapp/flow-engine/registration.flow-handler.ts` | accept + invoke `onRegistrationComplete` |
| `apps/api/src/modules/whatsapp/create-pipeline.ts` | wire WrdoUserService → handler when module available |
| `__tests__/*.unit.spec.ts` | service idempotency, flow persists-on-consent, best-effort-on-failure |

## Testing

- `WrdoUserService` unit: getOrCreate creates once, second call returns same id
  (idempotent), getByChannelIdentity null when absent — against a fake directory.
- Flow unit: consent → persist callback invoked with mapped data; callback throw
  → still returns welcome (best-effort), error logged.
- Predeploy sim: `medusa db:migrate` on scratch pg goes green with the new module.

## Out of scope (next plan steps)

- `identity-registration`, `tribe-engagement`, `tribe-directory`, booking, loyalty
  (plan steps 2-6).
- `heart.*` handler resolver repointing (plan "Wiring" section).
- `updateBsuidByPhone` real impl (currently a no-op stub) — fold in when the
  BSUID pairing surface is needed.
