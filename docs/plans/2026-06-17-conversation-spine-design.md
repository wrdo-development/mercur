# Conversation Spine — design (first slice)

**Date:** 2026-06-17
**Ticket:** WRDO-180 (create before PR; relates to WRDO-179 identity, WRDO-177 TalkJS removal)
**Status:** DESIGN — approved by Alwyn 2026-06-17. Implementation plan via writing-plans.

## Goal

One server-side conversation thread **per person**; WhatsApp and the shop
storefront are two windows onto it. The conversation lives in WRDO's brain, not
in any channel — so it "just continues" across surfaces (proven by the Path B
spike on Alwyn's phone, 2026-06-16).

**Locked acceptance criterion:** *one thread holds across WhatsApp + shop web on
phone AND desktop.* A tested checkbox, not an assumption (the spike's desktop
CORS failure cannot recur because the page + API are same-origin — verify it).

**This slice:** thread store + same-origin API + storefront widget, end-to-end.
AI (Letta/LiteLLM) and realtime (Sockudo) stay stubbed/polled — Phase 2.

## Decisions locked (with Alwyn, 2026-06-17)

1. **First slice = storefront only**, proven end-to-end before fanning to vendor.
2. **One thread per person ↔ WRDO.** Order/product/subject = metadata on a
   message, NOT a separate thread. Buyer↔seller is mediated BY WRDO, never direct
   (matches the "WRDO is the face/relationship" moat).
3. **Web identity = WhatsApp→web single-use signed token → first-party cookie**
   (spike-proven; survives sleep/wake).
4. **Channel-native rendering now.** `ChannelRenderer` seam: same voice, native
   controls per surface. `sourceChannel` stamps every turn → WRDO knows where the
   person is *this turn*.
5. **Durable channel + timestamp ledger.** Every message stores `channel` +
   `created_at` → the permanent substrate for "on WhatsApp, on 12 June 2026, you
   said…" recall. (Storage now; the eloquent recall sentence needs Letta = Phase 2.)
6. **Phone is the universal identity anchor.** `user_channel_identity` keys
   `channel_user_id = phone` for BOTH `whatsapp` and `web` → a later WhatsApp
   login resolves to the SAME `wrdo_users` as a web signup with that number. **No
   merge engine ever needed** — the phone is the merge.
7. **Guest-first registration.** WhatsApp offers registration but never forces it
   ("set up your profile — or just tell me what you need?"). `wrdo_users` is born
   at FIRST contact with `registration_state='guest'` (display_name null); the
   thread keys to it from message one. Registration later UPDATES the same row to
   `'complete'`. (Revises WRDO-179: create at first-contact, promote on consent —
   small dependency, see Dependencies.)
8. **Sequencing:** slice 1 = WhatsApp-entry spine (this doc); slice 2 = desktop-web
   phone+OTP registration (own slice — OTP sender is a sub-build, no Twilio).

## §1 Architecture & data model

New `tribe-messages` Medusa module in `apps/api/src/modules/` (follows the
`wrdo-user` pattern — model + generated migration committed together,
predeploy-green).

**Models:**
- `tribe_thread` — `id`, `user_id` (→ `wrdo_users.id`, the one-thread key,
  unique), `last_message_at`, `metadata?`.
- `tribe_message` — `id`, `thread_id`, `sender` enum(`user`|`wrdo`), `channel`
  enum(`whatsapp`|`web`), `text`, `media_urls?` (json), `context?` (json:
  order_id/product_id/subject as message metadata), `created_at`. Index on
  `(thread_id, created_at)` for cursor paging.

**`ThreadService` — the transport-agnostic write seam (the un-gluing):**
- `appendMessage(userId, { sender, channel, text, context })` — single write
  path. Both the WhatsApp pipeline and the web API call it. Replies stop being
  WhatsApp-only.
- `getThread(userId)` / `getMessages(userId, { after? })` — read path for any
  window.
- Outbound dispatch: WRDO reply → append to thread → fan out to the person's
  active channels via `ChannelRenderer` adapters.

**`ChannelRenderer` interface** — `render(reply) → channel-native payload`:
- `WhatsAppRenderer` — wraps the existing `MessageSenderService` (text + WA
  interactive buttons).
- `WebRenderer` — returns structured JSON (text + action buttons) the widget
  renders. Sets up the Book&Pay card cleanly for later.

The existing `MessageSenderService` becomes the WhatsApp adapter (one of N).

## §2 HTTP API & identity

**Same-origin** routes under `apps/api/src/api/store/` (kills the spike's CORS
artifact — page + API from the same backend):

- `POST /store/messages` — `{ text, context?, client_msg_id }`. Resolves
  `wrdo_users.id` from the first-party cookie → append (channel=`web`,
  sender=`user`) → pipeline (stub AI) → append WRDO reply → return `WebRenderer`
  payload. Idempotent via `client_msg_id` (reuses WhatsApp idempotency pattern).
- `GET /store/messages?after=<cursor>` — this person's messages since cursor
  (web "receives" by polling ~3s). Cursor = last `created_at`/`id`.
- `GET /store/thread` — thread head + unread count (feeds MessageButton/badge seams).
- `POST /store/session/exchange` — `{ t }`. Verifies + burns the single-use token
  → sets first-party `httpOnly` signed cookie → `wrdo_users.id`.

**Token (WhatsApp→web):** short-lived (5 min), single-use, signed (HMAC over
`wrdo_users.id` + nonce + exp), stored in Redis (`web_token:<nonce>`, TTL,
deleted on use). Reuses the `web_token` / `web_token_expires_at` columns already
on `tribe_session`. WhatsApp offers "continue on web: shop.wrdo.co.za/c?t=<token>".

**Scope lines:** no login form, no Medusa-customer link this slice — the WhatsApp
token IS the entry.

## §3 Storefront widget wiring

Seams already clean (TalkJS stubbed, signatures preserved — WRDO-177):

- `TalkJsProvider.tsx` (pass-through) → `SpineProvider`: on mount, exchange
  `?t=<token>` if present (sets cookie); hold thread state + ~3s poll; expose
  `useThread()`.
- `ChatBox.tsx` ("coming soon") → real chat: message list from `WebRenderer` JSON,
  input → `POST /store/messages`. Existing `order_id`/`product_id`/`subject` props
  → `context` on the outgoing message (page-aware).
- `UserMessagesSection.tsx` + `MessageButton` → thread view + unread badge from
  `GET /store/thread`.
- No realtime — the 3s poll is the "receive" (Sockudo = Phase 2).

## §4 Testing & acceptance

**Backend unit (jest @swc/jest):**
- `ThreadService`: append (both channels), `getMessages(after)` paging,
  one-thread-per-person, guest row born `state='guest'` then promoted.
- Identity rule: `getOrCreate('whatsapp', phone)` then `getOrCreate('web', phone)`
  → SAME `wrdo_users.id` (the no-merge guarantee — load-bearing test).
- Token: mint→exchange burns it; expired rejected; tampered signature rejected.
- `ChannelRenderer`: same reply → WhatsApp interactive vs Web JSON; `sourceChannel`
  stamped on every stored message.

**Predeploy smoke:** `medusa db:generate tribe_messages` → commit migration → full
`medusa db:migrate` on a scratch DB (Colima or local pg16) → green before PR.

**Manual acceptance (the locked checkbox):** open the shop widget via a WhatsApp
token link on phone AND desktop; web send → same thread WhatsApp writes to; a
WhatsApp reply appears in the web widget within a poll cycle. Same-origin = no CORS.

## Dependencies / out of scope

- **WRDO-179 tweak:** move `wrdo_users` create from end-of-flow (consent) to
  first-contact (`state='guest'`), promote on consent. Small, in this slice's scope.
- **Out of scope (recorded):** realtime/Sockudo (poll stands in), Letta/LiteLLM
  (AI stub — recall-sentence waits on this), vendor-panel wiring (next slice),
  desktop-web phone+OTP registration (slice 2).
