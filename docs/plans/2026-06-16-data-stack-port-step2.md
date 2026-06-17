# Data-Stack Port → Mercur (Step 2) Plan

> **For Claude:** REQUIRED SUB-SKILL: superpowers:writing-plans, then superpowers:executing-plans / subagent-driven-development task-by-task. This plan is DESIGN ONLY — do not build until Alwyn approves scope.

**Goal:** Migrate WRDO's data-stack modules into the Mercur production backend so the WhatsApp flows stop degrading to stubs — real identity, real provider lookup, real booking/loyalty — and then wire the `heart.*` flow handlers against those modules. This is the phase the Step-1 port plan explicitly deferred.

**Prerequisite met:** Step 1 done (real phone → reply, WRDO-169). Registration multi-turn bug fixed + deployed (`fix/wrdo-registration-role-desync`, commit 9c90408).

**Linear:** WRDO-### (create before building). Relates to WRDO-178 (front-desk `you` flows already authored; their `heart.*` handlers are the consumers of this migration).

---

## The single most important fact (mechanism mismatch)

**Mercur uses Medusa's native migration system, NOT Supabase SQL files.**

- Mercur `apps/api` has **no `supabase/migrations/` dir**. Predeploy runs `medusa db:migrate && medusa exec seed-wrdo.ts` against `DATABASE_URL`.
- product-tribe authored data-stack schema as hand-written `supabase/migrations/*.sql` (e.g. `20260511_19_create_wrdo_users_and_identity.sql`). **That mechanism does not exist in mercur.**
- In mercur each module defines `model.define()` models and migrations are **generated** by `medusa db:generate <module>` and committed, then applied by `medusa db:migrate` at predeploy.
- **The predeploy trap (live, already bit us once — WhatsApp bug #1):** registering a module that has a model but NO generated migration makes `medusa db:migrate` fail → the WHOLE backend build fails → Cloud serves the old build. Therefore: **for every module ported, models + generated migration must land together, and predeploy must be green before the next module.**

**Consequence for WRDO-178:** the `tribe-engagement` module I authored (user_interest/user_follow/user_notification_pref) used a product-tribe `supabase/migrations/*.sql`. In mercur it must be re-homed: keep the `model.define()` models, DROP the hand-written SQL, generate the migration via `medusa db:generate tribe_engagement`.

## Schema dualism (the reconciliation the Step-1 plan flagged)

- Both product-tribe and mercur are Medusa v2 (mercur pins 2.13.4). product-tribe data-stack models use `model.id()` (TEXT/ULID-style) PKs — same family as Medusa core. So this is **NOT** a UUID-vs-TEXT war at the model layer; it's Medusa-text throughout.
- The real reconciliation points to verify per module:
  1. **Cross-module links.** product-tribe used logical `user_id` text refs (no hard FK) precisely for Medusa module isolation — that travels cleanly. Confirm no module assumes a hard FK to a table in another module.
  2. **Mercur's own tables.** Mercur (marketplace) already owns `seller`, `product`, `order`, `customer`. Where a tribe module overlaps (e.g. provider ≈ seller, booking ≈ order), decide: reuse Mercur's table or keep tribe's parallel one. THIS is the actual dualism — resolve per module, do not blanket-migrate.
  3. **RLS / triggers.** product-tribe SQL added `set_updated_at` triggers + `service_role` RLS. Medusa-generated migrations don't add these. Decide if they're needed (Medusa manages updated_at itself; RLS only matters if something outside Medusa reads the DB).

## Dependency order (what moves, in what sequence)

Each step = its own PR, predeploy green before the next. Order is by dependency:

1. **`wrdo-user`** (+ `user_channel_identity`) — the identity root. Everything else FKs (logically) to `wrdo_users.id`. Models exist; generate migration. Register in medusa-config. This unblocks `heart.identity.*` handlers.
   - Re-home the `tribe-user` service facade alongside (or fold it in) — it's the consumed surface.
   - ⚠️ dual-write window vs `tribe_users` (closes ~2026-07-06): in mercur there is no legacy `tribe_users`, so this is a CLEAN install — skip the dual-write scaffolding, go straight to wrdo_users-primary.
2. **`identity-registration`** — verification/capability gating. Depends on wrdo_users. Models: identity_attribute, capability_requirement, verification_run.
3. **`tribe-engagement`** (from WRDO-178) — user_interest/user_follow/user_notification_pref. Depends on wrdo_users. Re-home SQL→Medusa-generated migration.
4. **`tribe-directory`** — providers/listings. THE big dualism decision: provider vs Mercur `seller`. Likely the largest reconciliation.
5. **`tribe-booking`** + **`tribe-listing`** — depend on directory. booking vs Mercur `order` decision.
6. **`tribe-loyalty`** — Sparks. Independent-ish; can move earlier if loyalty work prioritised (see [[project_loyalty_wallet]]).

Stop after each; re-test the live WhatsApp flow degrades-or-works as expected.

## Wiring the `heart.*` handlers (the actual ask)

Once wrdo-user + tribe-engagement are in (steps 1+3), wire the flow-executor's handler registry so the `you`-flow `heart.*` keys resolve to real calls:

- `heart.identity.channels / linkStart / unlink` → `WrdoUserService.getByChannelIdentity / linkChannelIdentity / unlinkChannelIdentity`
- `heart.profile.get / update` → `WrdoUserService` + `tribe-engagement`
- `heart.appointments.* / heart.notifications.*` (WRDO-178 new flows) → `tribe-booking` (steps 5) + `tribe-engagement` notification prefs
- Convention LOCKED (WRDO-178): `heart.*` keys stay as opaque ids; the RESOLVER repoints at these Medusa modules. No flow-JSON churn.
- The executor's `IdentityResolver` (flow-executor.v2) is the bridge — it mints the channel→wrdo_users.id resolution and is also what the web-no-login token-exchange needs.

## Out of scope (this plan)

- Web ChannelRenderer + token-exchange (separate; needs IdentityResolver from step 1 first).
- The conversation-spine tables (`conversation_threads`/`messages`) — only needed when chat history must survive server-side beyond Redis session state. Defer until a flow needs it.
- LiteLLM wiring (AI client is still a stub).
- Mercur seller/vendor-side front desk.

## Verification per step

- `medusa db:generate <module>` produces a migration; commit it.
- Local: `yarn build` (does NOT run predeploy) AND simulate predeploy: `medusa db:migrate` against a scratch DB.
- Unit tests for each service (mercur uses jest `@swc/jest`, pattern `src/**/__tests__/**/*.unit.spec.ts`).
- Deploy one module at a time; warm the Cloud cold-start; re-test the live flow.

## First concrete task (when approved)

Port `wrdo-user`: copy models, generate migration, register, write `WrdoUserService` unit tests, simulate predeploy green, PR. Nothing else until that's deployed clean — the predeploy trap makes big-bang migration reckless.
