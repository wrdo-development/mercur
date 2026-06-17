# WhatsApp registration: confirm-not-collect name — design

**Date:** 2026-06-17
**Ticket:** WRDO-169 (follow-up)
**Scope:** Name step only. `create_user → Supabase` persistence is a separate PR.

## Problem

The webhook handler parses the WhatsApp profile name from `contacts[].profile.name`
and sets it on `ParsedWebhookResult.contactName`
(`webhook-handler.service.ts:156-162`). **Nothing reads it.** It is dead data.

Registration opens cold with `"Hey! 👋 What's your name?"`, which violates the
locked resident-registration spec (WhatsApp-first, *confirm-not-collect*): we
already know the name, so we should confirm it ("You're Thabo, right?") instead
of asking for it.

## Approach

Thread `contactName` from the pipeline down to `startRegistration`, and add a
`confirm_name` step in front of `collect_name`.

### Data flow (the one change that matters)

```
parsePayload → result.contactName            (already parsed, today)
processParsedResult → classifyAndRoute(..., contactName)   (NEW: pass it)
classifyAndRoute → startRegistration(from, contactName)    (NEW: pass it)
startRegistration:
  contactName present → seed data.name, step = confirm_name, prompt confirm
  contactName null     → existing cold path, step = collect_name
```

### State machine

New first step `confirm_name` (only entered when a name is known):

- Prompt: `"You're {name}, right? (reply yes, or just type your name)"`
- Input `yes`/`y`/`yep`/`yeah`/`correct` → keep seeded `data.name`, advance to `collect_role`.
- **Any other text → that text IS the corrected name** (one-tap if right, one
  message if wrong). Save it, advance to `collect_role`.
- Empty/very-short correction (<2 chars) → re-prompt confirm (reuse the
  name_too_short guard rather than accepting a 1-char "name").

`collect_name` stays exactly as-is — it is the fallback when the profile name is
hidden (`contactName === null`), and keeps every existing test green.

### Backward compatibility

- `startRegistration(phone)` keeps working — `contactName` is an optional 2nd arg.
- `confirm_name` is additive; `collect_name` path untouched.
- The "never clobber an in-progress registration" guard
  (`registration.flow-handler.ts:51`) still fires first, so a re-greeting
  mid-flow re-prompts the current step (which may now be `confirm_name`).

## Files

| File | Change |
|---|---|
| `tribe-sessions/registration.flow.ts` | add `confirm_name` to step list, `STEP_PROMPTS`, `getPromptForStep`, and a `case 'confirm_name'` in `processRegistrationStep` (parameterised prompt built from `data.name`) |
| `whatsapp/flow-engine/registration.flow-handler.ts` | `startRegistration(phone, contactName?)` — seed name + `confirm_name` when present |
| `whatsapp/webhook-pipeline.classify.ts` | `classifyAndRoute(..., contactName?)`; pass to `startRegistration` |
| `whatsapp/webhook-pipeline.service.ts` | read `result.contactName`, pass into `classifyAndRoute` |
| `__tests__/registration.flow-handler.unit.spec.ts` (+ flow spec) | confirm-yes, confirm-correct, null-name-falls-back-to-cold |

## Testing

Unit-level (the flow is pure given state+text):
1. `startRegistration` with a name → state `confirm_name`, `data.name` seeded, prompt names them.
2. `startRegistration` with no name → state `collect_name`, cold prompt (regression).
3. `confirm_name` + "yes" → `collect_role`, name preserved.
4. `confirm_name` + "Thabo M." → `collect_role`, `data.name === "Thabo M."`.
5. `confirm_name` + "x" (too short) → stays `confirm_name`, re-prompts.

## Out of scope (next PR)

- `create_user → wrdo_users` persistence (Mercur model + WRDO-169 BSUID tie-in, ~Jul 4).
- Profile-name prefill for the booking flow (separate flow).
