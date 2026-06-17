# Conversation Spine (First Slice) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build one server-side conversation thread per person, with the shop storefront and WhatsApp as two windows onto it; prove "one thread holds across WhatsApp + web on phone AND desktop."

**Architecture:** A new `tribe-messages` Medusa module (durable `tribe_thread` + `tribe_message` Postgres models) fronted by a transport-agnostic `ThreadService`. A `ChannelRenderer` seam renders the same reply natively per surface (`WhatsAppRenderer`/`WebRenderer`). Same-origin `/store/*` routes let the web widget read/write the thread; a single-use signed token hands a WhatsApp person off to the web with a first-party cookie. AI (Letta/LiteLLM) and realtime (Sockudo) are stubbed/polled this slice.

**Tech Stack:** Medusa v2 (2.13.4), MikroORM models via `model.define`, jest + `@swc/jest` for unit tests, ioredis for the token store, Next 15 storefront (client widget calls relative same-origin `/store/*`).

**Reference design:** `docs/plans/2026-06-17-conversation-spine-design.md`

**Repos:**
- Backend: `/Users/alwyn/dev/mercur-backend` (branch `feat/conversation-spine-WRDO-180`)
- Storefront: `/Users/alwyn/dev/mercur-storefront`

**Key conventions (verified):**
- Store route shape: `export async function POST(req: MedusaRequest, res: MedusaResponse)`; resolve a module with `req.scope.resolve(MODULE_KEY)` (same as `webhooks/whatsapp/route.ts`).
- Module pattern: copy `apps/api/src/modules/wrdo-user` — model + `MedusaService` + `Module()` + **generated migration committed in the same commit** (predeploy trap).
- No `.js` import specifiers on relative imports (Node16 runtime can't resolve them — the repo convention).
- Predeploy smoke: `medusa db:generate <module>` then `medusa db:migrate` against a scratch DB (local pg16 `postgres://alwyn@localhost:5432/<scratch>` OR Colima). The root `medusa` bin is at `../../node_modules/.bin/medusa` from `apps/api`; set `DATABASE_URL` inline.
- Unit test runner from `apps/api`: `TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit <pattern>`.

---

## Task 1: tribe_thread + tribe_message models

**Files:**
- Create: `apps/api/src/modules/tribe-messages/models/tribe-thread.ts`
- Create: `apps/api/src/modules/tribe-messages/models/tribe-message.ts`

**Step 1: Write the thread model**

```ts
// apps/api/src/modules/tribe-messages/models/tribe-thread.ts
import { model } from '@medusajs/framework/utils';

/**
 * tribe_thread — exactly ONE per person. Keyed on wrdo_users.id. WhatsApp, web,
 * and (later) other surfaces are all windows onto this single thread; there is
 * nothing to "sync" — one conversation rendered in many places.
 */
const TribeThread = model
  .define('tribe_thread', {
    id: model.id().primaryKey(),
    user_id: model.text(),
    last_message_at: model.dateTime().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([{ on: ['user_id'], unique: true }]);

export default TribeThread;
```

**Step 2: Write the message model**

```ts
// apps/api/src/modules/tribe-messages/models/tribe-message.ts
import { model } from '@medusajs/framework/utils';

/**
 * tribe_message — one row per turn. `channel` + `created_at` are load-bearing:
 * they are the permanent substrate for cross-channel, time-aware recall
 * ("on WhatsApp, on 12 June, you said…"). `context` carries order/product/subject
 * as message metadata (NOT a separate thread).
 */
const TribeMessage = model
  .define('tribe_message', {
    id: model.id().primaryKey(),
    thread_id: model.text(),
    sender: model.enum(['user', 'wrdo']),
    channel: model.enum(['whatsapp', 'web']),
    text: model.text(),
    media_urls: model.json().nullable(),
    context: model.json().nullable(),
  })
  .indexes([{ on: ['thread_id'] }]);

export default TribeMessage;
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/tribe-messages/models
git commit -m "feat(tribe-messages): thread + message models (WRDO-180)"
```

---

## Task 2: MedusaService + module registration + generated migration

**Files:**
- Create: `apps/api/src/modules/tribe-messages/service.ts`
- Create: `apps/api/src/modules/tribe-messages/index.ts`
- Modify: `apps/api/medusa-config.ts` (register `./src/modules/tribe-messages`)
- Generated: `apps/api/src/modules/tribe-messages/migrations/Migration*.ts` (+ `.snapshot-*.json`)

**Step 1: MedusaService**

```ts
// apps/api/src/modules/tribe-messages/service.ts
import { MedusaService } from '@medusajs/framework/utils';
import TribeMessage from './models/tribe-message';
import TribeThread from './models/tribe-thread';

class TribeMessagesModuleService extends MedusaService({
  TribeThread,
  TribeMessage,
}) {}

export default TribeMessagesModuleService;
```

**Step 2: index.ts**

```ts
// apps/api/src/modules/tribe-messages/index.ts
import { Module } from '@medusajs/framework/utils';
import TribeMessagesModuleService from './service';

export const TRIBE_MESSAGES_MODULE = 'tribe_messages';

export default Module(TRIBE_MESSAGES_MODULE, {
  service: TribeMessagesModuleService,
});

export {
  type AppendMessageInput,
  type Channel,
  type Sender,
  ThreadService,
  type ThreadServiceDirectory,
  type ThreadRecord,
  type MessageRecord,
} from './thread.service';
```
(The `thread.service` exports land in Task 3; this import will fail to typecheck until then — that's expected, do Task 3 before typechecking.)

**Step 3: Register in medusa-config.ts**

Add after the `./src/modules/wrdo-user` block:

```ts
    {
      // tribe-messages: the conversation spine (tribe_thread + tribe_message).
      // Model + generated migration committed together (predeploy trap).
      resolve: './src/modules/tribe-messages',
    },
```

**Step 4: Generate the migration against a scratch DB**

```bash
PSQL=/opt/homebrew/Cellar/postgresql@16/16.11_1/bin/psql
$PSQL -h localhost -U alwyn -d postgres -c "DROP DATABASE IF EXISTS wrdo_smoke; CREATE DATABASE wrdo_smoke;"
cd apps/api
DATABASE_URL="postgres://alwyn@localhost:5432/wrdo_smoke" DISABLE_MEDUSA_ADMIN=true ../../node_modules/.bin/medusa db:generate tribe_messages
```
Expected: `Generated successfully (Migration*.ts).` and a `migrations/` dir with the migration + `.snapshot-tribe-messages.json`. Verify the migration creates `tribe_thread` (unique index on user_id) and `tribe_message`.

**Step 5: Predeploy smoke (the trap) — run full migrate on scratch DB**

```bash
DATABASE_URL="postgres://alwyn@localhost:5432/wrdo_smoke" DISABLE_MEDUSA_ADMIN=true ../../node_modules/.bin/medusa db:migrate
```
Expected: exit 0, "Migration scripts completed". Verify:
```bash
$PSQL -h localhost -U alwyn -d wrdo_smoke -tAc "SELECT tablename FROM pg_tables WHERE tablename IN ('tribe_thread','tribe_message');"
```
Expected: both names printed. Then drop the scratch DB.

**Step 6: Commit**

```bash
git add apps/api/src/modules/tribe-messages/service.ts apps/api/src/modules/tribe-messages/index.ts apps/api/src/modules/tribe-messages/migrations apps/api/medusa-config.ts
git commit -m "feat(tribe-messages): register module + generated migration, predeploy green (WRDO-180)"
```

---

## Task 3: ThreadService — transport-agnostic write/read seam

**Files:**
- Create: `apps/api/src/modules/tribe-messages/thread.service.ts`
- Test: `apps/api/src/modules/tribe-messages/__tests__/thread.service.unit.spec.ts`

**Step 1: Write the failing test**

```ts
// __tests__/thread.service.unit.spec.ts
import {
  type MessageRecord,
  type ThreadRecord,
  ThreadService,
  type ThreadServiceDirectory,
} from '../thread.service';

function fakeDirectory() {
  const threads = new Map<string, ThreadRecord>();
  const messages: MessageRecord[] = [];
  let tSeq = 0;
  let mSeq = 0;
  const dir: ThreadServiceDirectory = {
    async listTribeThreads(filters) {
      return [...threads.values()].filter((t) => t.user_id === filters.user_id);
    },
    async createTribeThreads(data) {
      tSeq += 1;
      const t: ThreadRecord = { id: `thr_${tSeq}`, user_id: data.user_id as string, last_message_at: null, metadata: null };
      threads.set(t.id, t);
      return t;
    },
    async updateTribeThreads(data) {
      const t = threads.get(data.id as string)!;
      Object.assign(t, data);
      return t;
    },
    async createTribeMessages(data) {
      mSeq += 1;
      const m: MessageRecord = {
        id: `msg_${mSeq}`,
        thread_id: data.thread_id as string,
        sender: data.sender as MessageRecord['sender'],
        channel: data.channel as MessageRecord['channel'],
        text: data.text as string,
        media_urls: null,
        context: (data.context as Record<string, unknown> | null) ?? null,
        created_at: new Date(2026, 5, 17, 0, 0, mSeq),
      };
      messages.push(m);
      return m;
    },
    async listTribeMessages(filters, _config) {
      return messages
        .filter((m) => m.thread_id === filters.thread_id)
        .filter((m) => (filters._after ? m.id > (filters._after as string) : true));
    },
  };
  return { dir, _threadCount: () => threads.size, _messages: () => messages };
}

describe('ThreadService.appendMessage — one thread per person', () => {
  it('creates the thread on first append and reuses it on the second', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'whatsapp', text: 'hi' });
    await svc.appendMessage('user_1', { sender: 'wrdo', channel: 'whatsapp', text: 'hey!' });
    expect(f._threadCount()).toBe(1);
    expect(f._messages()).toHaveLength(2);
  });

  it('stamps channel + sender on each message', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'web', text: 'about this couch', context: { product_id: 'p1' } });
    const m = f._messages()[0];
    expect(m.channel).toBe('web');
    expect(m.sender).toBe('user');
    expect(m.context).toEqual({ product_id: 'p1' });
  });
});

describe('ThreadService.getMessages — cursor paging', () => {
  it('returns only messages after the cursor', async () => {
    const f = fakeDirectory();
    const svc = new ThreadService(f.dir);
    await svc.appendMessage('user_1', { sender: 'user', channel: 'web', text: 'one' });
    const all = await svc.getMessages('user_1');
    await svc.appendMessage('user_1', { sender: 'wrdo', channel: 'web', text: 'two' });
    const after = await svc.getMessages('user_1', { after: all[0].id });
    expect(after.map((m) => m.text)).toEqual(['two']);
  });
});
```

**Step 2: Run it, verify it fails**

Run: `cd apps/api && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit thread.service`
Expected: FAIL — cannot find `../thread.service`.

**Step 3: Implement ThreadService**

```ts
// apps/api/src/modules/tribe-messages/thread.service.ts
export type Sender = 'user' | 'wrdo';
export type Channel = 'whatsapp' | 'web';

export interface ThreadRecord {
  id: string;
  user_id: string;
  last_message_at: Date | null;
  metadata: Record<string, unknown> | null;
}

export interface MessageRecord {
  id: string;
  thread_id: string;
  sender: Sender;
  channel: Channel;
  text: string;
  media_urls: string[] | null;
  context: Record<string, unknown> | null;
  created_at: Date;
}

export interface AppendMessageInput {
  sender: Sender;
  channel: Channel;
  text: string;
  context?: Record<string, unknown> | null;
}

/** Minimal slice of the MedusaService that ThreadService consumes (fake-able in tests). */
export interface ThreadServiceDirectory {
  listTribeThreads(filters: Record<string, unknown>): Promise<ThreadRecord[]>;
  createTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
  updateTribeThreads(data: Record<string, unknown>): Promise<ThreadRecord>;
  createTribeMessages(data: Record<string, unknown>): Promise<MessageRecord>;
  listTribeMessages(
    filters: Record<string, unknown>,
    config?: Record<string, unknown>,
  ): Promise<MessageRecord[]>;
}

export class ThreadService {
  constructor(private readonly dir: ThreadServiceDirectory) {}

  /** Get-or-create the single thread for a person. */
  async getThread(userId: string): Promise<ThreadRecord> {
    const existing = await this.dir.listTribeThreads({ user_id: userId });
    if (existing[0] !== undefined) {
      return existing[0];
    }
    return this.dir.createTribeThreads({ user_id: userId });
  }

  /** Append one turn to the person's thread. The single durable write path. */
  async appendMessage(userId: string, input: AppendMessageInput): Promise<MessageRecord> {
    const thread = await this.getThread(userId);
    const message = await this.dir.createTribeMessages({
      thread_id: thread.id,
      sender: input.sender,
      channel: input.channel,
      text: input.text,
      context: input.context ?? null,
    });
    await this.dir.updateTribeThreads({ id: thread.id, last_message_at: message.created_at });
    return message;
  }

  /** Read this person's messages, optionally after a cursor (message id). */
  async getMessages(userId: string, options: { after?: string } = {}): Promise<MessageRecord[]> {
    const thread = await this.getThread(userId);
    return this.dir.listTribeMessages(
      { thread_id: thread.id, _after: options.after },
      { order: { created_at: 'ASC' } },
    );
  }
}
```
> NOTE for executor: the real `listTribeMessages` cursor filter cannot use a fake `_after` key against MedusaService. In Task 8 (route wiring) the `after` cursor is applied via a `created_at`/`id` filter using Medusa's query operators; the fake models it with `_after` only for the unit test. Keep `getMessages` signature stable; refine the filter when wiring the real directory.

**Step 4: Run tests, verify pass**

Run: `TEST_TYPE=unit ... npx jest ... thread.service`
Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add apps/api/src/modules/tribe-messages/thread.service.ts apps/api/src/modules/tribe-messages/__tests__/thread.service.unit.spec.ts
git commit -m "feat(tribe-messages): ThreadService append/get with one-thread-per-person (WRDO-180)"
```

---

## Task 4: ChannelRenderer (WhatsApp + Web)

**Files:**
- Create: `apps/api/src/modules/tribe-messages/renderers/channel-renderer.ts`
- Test: `apps/api/src/modules/tribe-messages/__tests__/channel-renderer.unit.spec.ts`

**Step 1: Failing test**

```ts
import { WebRenderer, WhatsAppRenderer, type WrdoReply } from '../renderers/channel-renderer';

const reply: WrdoReply = {
  text: 'Want me to book the plumber?',
  actions: [{ id: 'book', label: 'Book & Pay' }, { id: 'more', label: 'More options' }],
};

describe('ChannelRenderer', () => {
  it('WebRenderer returns structured JSON the widget renders', () => {
    const out = new WebRenderer().render(reply);
    expect(out).toEqual({ kind: 'web', text: reply.text, actions: reply.actions });
  });

  it('WhatsAppRenderer returns text + interactive button payload', () => {
    const out = new WhatsAppRenderer().render(reply);
    expect(out.kind).toBe('whatsapp');
    expect(out.text).toBe(reply.text);
    expect(out.buttons).toEqual([
      { id: 'book', title: 'Book & Pay' },
      { id: 'more', title: 'More options' },
    ]);
  });

  it('WhatsAppRenderer omits buttons when there are none', () => {
    const out = new WhatsAppRenderer().render({ text: 'hello' });
    expect(out.buttons).toBeUndefined();
  });
});
```

**Step 2: Run, verify fail.**

**Step 3: Implement**

```ts
// apps/api/src/modules/tribe-messages/renderers/channel-renderer.ts
export interface ReplyAction {
  id: string;
  label: string;
}

/** Channel-agnostic reply produced by the brain. Same content, rendered per surface. */
export interface WrdoReply {
  text: string;
  actions?: ReplyAction[];
}

export interface WebPayload {
  kind: 'web';
  text: string;
  actions?: ReplyAction[];
}

export interface WhatsAppPayload {
  kind: 'whatsapp';
  text: string;
  buttons?: { id: string; title: string }[];
}

export interface ChannelRenderer<T> {
  render(reply: WrdoReply): T;
}

export class WebRenderer implements ChannelRenderer<WebPayload> {
  render(reply: WrdoReply): WebPayload {
    return { kind: 'web', text: reply.text, actions: reply.actions };
  }
}

export class WhatsAppRenderer implements ChannelRenderer<WhatsAppPayload> {
  render(reply: WrdoReply): WhatsAppPayload {
    const buttons = reply.actions?.map((a) => ({ id: a.id, title: a.label }));
    return {
      kind: 'whatsapp',
      text: reply.text,
      ...(buttons && buttons.length > 0 ? { buttons } : {}),
    };
  }
}
```

**Step 4: Run, verify pass. Step 5: Commit.**

```bash
git add apps/api/src/modules/tribe-messages/renderers apps/api/src/modules/tribe-messages/__tests__/channel-renderer.unit.spec.ts
git commit -m "feat(tribe-messages): ChannelRenderer — WhatsApp + Web (WRDO-180)"
```

---

## Task 5: Web handoff token (mint/verify/burn)

**Files:**
- Create: `apps/api/src/modules/tribe-messages/web-token.ts`
- Test: `apps/api/src/modules/tribe-messages/__tests__/web-token.unit.spec.ts`

**Design:** signed (HMAC-SHA256 over `userId.nonce.exp`), single-use (nonce stored in a redis-like KV, deleted on verify), short TTL (5 min). Inject a KV adapter + a `now()` + secret for testability.

**Step 1: Failing test**

```ts
import { createWebTokenService, type WebTokenKv } from '../web-token';

function fakeKv(): WebTokenKv & { _store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    _store: store,
    async set(key, value, ..._args) { store.set(key, value); return 'OK'; },
    async get(key) { return store.get(key) ?? null; },
    async del(key) { const had = store.delete(key); return had ? 1 : 0; },
  };
}

const SECRET = 'test-secret';

describe('web-token', () => {
  it('mints a token that verifies back to the user id', async () => {
    let t = 1_000_000;
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => t });
    const token = await svc.mint('user_1');
    const userId = await svc.verifyAndBurn(token);
    expect(userId).toBe('user_1');
  });

  it('is single-use — a second verify fails', async () => {
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => 1_000_000 });
    const token = await svc.mint('user_1');
    await svc.verifyAndBurn(token);
    await expect(svc.verifyAndBurn(token)).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    let t = 1_000_000;
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => t });
    const token = await svc.mint('user_1');
    t += 6 * 60 * 1000; // +6 min, past the 5-min TTL
    await expect(svc.verifyAndBurn(token)).resolves.toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const kv = fakeKv();
    const svc = createWebTokenService({ kv, secret: SECRET, nowMs: () => 1_000_000 });
    const token = await svc.mint('user_1');
    const tampered = `${token.slice(0, -2)}xx`;
    await expect(svc.verifyAndBurn(tampered)).resolves.toBeNull();
  });
});
```

**Step 2: Run, verify fail.**

**Step 3: Implement**

```ts
// apps/api/src/modules/tribe-messages/web-token.ts
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TTL_MS = 5 * 60 * 1000;

export interface WebTokenKv {
  set(key: string, value: string, ...args: string[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface WebTokenServiceOptions {
  kv: WebTokenKv;
  secret: string;
  nowMs?: () => number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createWebTokenService(options: WebTokenServiceOptions) {
  const now = options.nowMs ?? (() => Date.now());
  const { kv, secret } = options;

  return {
    /** Mint a single-use token for a user; stored in KV under its nonce. */
    async mint(userId: string): Promise<string> {
      const nonce = randomUUID();
      const exp = now() + TTL_MS;
      const payload = `${userId}.${nonce}.${exp}`;
      const sig = sign(payload, secret);
      await kv.set(`web_token:${nonce}`, '1', 'PX', String(TTL_MS));
      return `${Buffer.from(payload).toString('base64url')}.${sig}`;
    },

    /** Verify signature + expiry + single-use; returns userId or null. Burns the nonce. */
    async verifyAndBurn(token: string): Promise<string | null> {
      const parts = token.split('.');
      if (parts.length !== 2) return null;
      const [payloadB64, sig] = parts;
      let payload: string;
      try {
        payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
      } catch {
        return null;
      }
      if (!safeEqual(sign(payload, secret), sig)) return null;
      const [userId, nonce, expStr] = payload.split('.');
      if (!userId || !nonce || !expStr) return null;
      if (now() > Number(expStr)) return null;
      const burned = await kv.del(`web_token:${nonce}`);
      if (burned === 0 || burned === null) return null; // already used / unknown
      return userId;
    },
  };
}

export type WebTokenService = ReturnType<typeof createWebTokenService>;
```

**Step 4: Run, verify pass (4 tests). Step 5: Commit.**

```bash
git add apps/api/src/modules/tribe-messages/web-token.ts apps/api/src/modules/tribe-messages/__tests__/web-token.unit.spec.ts
git commit -m "feat(tribe-messages): single-use signed web-handoff token (WRDO-180)"
```

---

## Task 6: Identity rule test — phone is the universal anchor (no merge)

This is the load-bearing guarantee. It belongs to the `wrdo-user` module (already shipped). We assert the cross-channel no-merge invariant explicitly.

**Files:**
- Test: `apps/api/src/modules/wrdo-user/__tests__/wrdo-user.cross-channel.unit.spec.ts`

**Step 1: Write the test** (reuse the `fakeDirectory` pattern from `wrdo-user.service.unit.spec.ts`; copy that helper into this file or import if exported)

```ts
import { WrdoUserService } from '../wrdo-user.service';
// (paste the fakeDirectory() helper from wrdo-user.service.unit.spec.ts)

describe('phone is the universal identity anchor (no merge engine)', () => {
  it('whatsapp-first then web with the same phone resolves to the SAME user', async () => {
    const dir = fakeDirectory();
    const svc = new WrdoUserService(dir);
    const viaWa = await svc.getOrCreateByChannelIdentity('whatsapp', '27820000001', { displayName: 'Thabo' });
    const viaWeb = await svc.getOrCreateByChannelIdentity('web', '27820000001');
    expect(viaWeb.id).toBe(viaWa.id);
  });
});
```
> NOTE: `getByChannelIdentity` matches on `(channel, channel_user_id)`. For the SAME person across channels to resolve, the production resolution must check the phone across channels OR `getOrCreate('web', phone)` must find the existing user by phone. **Decision for the executor:** add a `getByPhone(phone)` lookup to `WrdoUserService` that lists identities by `channel_user_id` across channels; `getOrCreateByChannelIdentity` consults it first so a new channel for a known phone LINKS (adds identity) instead of creating a new user. Write that as Task 6b if the test fails (it will, with the current channel-scoped lookup).

**Step 6b (likely needed): add cross-channel resolution**

In `wrdo-user.service.ts`, before creating a new user in `getOrCreateByChannelIdentity`, look up any identity with the same `channel_user_id` (the phone) on any channel; if found, link the new channel to that user and return it. Add a `listUserChannelIdentities({ channel_user_id })` call (drop the `channel` filter) to the directory interface + fake. Unit-test both: same phone different channel → links; different phone → new user.

**Step: Commit**

```bash
git add apps/api/src/modules/wrdo-user
git commit -m "feat(wrdo-user): phone is the cross-channel anchor — link, never duplicate (WRDO-180)"
```

---

## Task 7: Guest-first — move wrdo_users create to first contact

Revises WRDO-179: born `state='guest'` at first contact, promoted to `complete` on consent.

**Files:**
- Modify: `apps/api/src/modules/whatsapp/webhook-pipeline.service.ts` (on first inbound, ensure a guest user exists)
- Modify: `apps/api/src/modules/whatsapp/create-pipeline.ts` (the persist hook now PROMOTES rather than creates)
- Test: extend `registration.flow-handler.unit.spec.ts` / pipeline test

**Step 1:** Write a test asserting: an inbound message from a new phone calls `getOrCreateByChannelIdentity('whatsapp', phone, { registrationState: 'guest' })` (guest born), and the consent completion calls an update to `registration_state='complete'` (promote), not a second create.

**Step 2-4:** Implement: inject a lightweight `ensureGuest(phone)` into the pipeline that runs once per inbound (idempotent via getOrCreate); change `onRegistrationComplete` to update the existing row's `registration_state` + `display_name` + consents. Keep best-effort semantics (swallow throws).

**Step 5: Commit**

```bash
git commit -am "feat(registration): guest-first — create user at first contact, promote on consent (WRDO-180)"
```

> NOTE: keep this task SMALL and behind the same best-effort guard. If it grows, split promote-vs-create into its own PR — do not destabilise the shipped WRDO-179 path.

---

## Task 8: Store API routes (same-origin)

**Files:**
- Create: `apps/api/src/api/store/messages/route.ts` (POST + GET)
- Create: `apps/api/src/api/store/thread/route.ts` (GET)
- Create: `apps/api/src/api/store/session/exchange/route.ts` (POST)
- Create: `apps/api/src/api/store/spine.helpers.ts` (cookie read/write, resolve user from cookie)

**Step 1:** Implement a cookie helper: sign `wrdo_users.id` into an `httpOnly` cookie (`wrdo_spine`) using `COOKIE_SECRET`; read+verify it on each request. Use `res.cookie`/`req.cookies` (Medusa express). Resolve the module: `req.scope.resolve(TRIBE_MESSAGES_MODULE)` and `req.scope.resolve(WRDO_USER_MODULE)`.

**Step 2: `POST /store/session/exchange`** — body `{ t }`. Build a `WebTokenService` (KV = the whatsapp Redis adapter; secret = `WHATSAPP_APP_SECRET` or a dedicated `SPINE_TOKEN_SECRET`). `verifyAndBurn(t)` → on success set the cookie, return `{ ok: true }`; on null return 401.

**Step 3: `POST /store/messages`** — read user from cookie (401 if absent). Body `{ text, context?, client_msg_id }`. Idempotency: skip if `client_msg_id` already seen (reuse `IdempotencyService` against Redis). `ThreadService.appendMessage(userId, { sender:'user', channel:'web', text, context })`. Run the (stub) AI/pipeline compose to get a `WrdoReply` — for this slice a minimal compose: call existing `aiClient.compose` and wrap as `{ text }`. `appendMessage(userId, { sender:'wrdo', channel:'web', text: reply.text })`. Return `new WebRenderer().render(reply)`.

**Step 4: `GET /store/messages?after=`** — user from cookie; `ThreadService.getMessages(userId, { after })`; return `{ messages }`. Implement the real cursor: list messages for the thread ordered by `created_at ASC`, filter id/created_at > cursor.

**Step 5: `GET /store/thread`** — user from cookie; return `{ thread, unreadCount }` (unreadCount = messages from `wrdo` after the user's last-seen marker; for this slice a simple count of wrdo messages since last GET, or 0 — keep minimal, mark TODO).

**Step 6:** Manual smoke with curl against a locally-running backend (or document that this is covered by the acceptance check in Task 11, since a full local Medusa boot needs DB+Redis). Add an integration test only if a test harness exists; otherwise rely on unit-tested services + the manual acceptance.

**Step 7: Commit**

```bash
git add apps/api/src/api/store
git commit -m "feat(store): same-origin spine API — messages, thread, session exchange (WRDO-180)"
```

---

## Task 9: Wire WhatsApp inbound through ThreadService

So WhatsApp turns land in the SAME durable thread (today they don't persist).

**Files:**
- Modify: `apps/api/src/modules/whatsapp/webhook-pipeline.service.ts`
- Modify: `apps/api/src/modules/whatsapp/create-pipeline.ts` (inject ThreadService built from `scope.resolve(TRIBE_MESSAGES_MODULE)`)

**Step 1:** Inject an optional `threadService` into the pipeline (undefined-safe, like other deps). On each processed inbound: resolve the person's `wrdo_users.id` (via the guest-ensure from Task 7), `appendMessage(userId, { sender:'user', channel:'whatsapp', text })`; after composing the reply, `appendMessage(userId, { sender:'wrdo', channel:'whatsapp', text: replyText })`. Best-effort — never block the WhatsApp reply on a ledger write (swallow + console.error, matching the existing pattern).

**Step 2:** Unit test: a processed inbound calls `appendMessage` twice (user then wrdo) with channel `whatsapp`.

**Step 3: Commit**

```bash
git commit -am "feat(whatsapp): persist inbound + reply to the spine thread (WRDO-180)"
```

---

## Task 10: Typecheck + full unit run + predeploy re-smoke

**Steps:**
1. `cd /Users/alwyn/dev/mercur-backend && npx tsc --noEmit -p apps/api/tsconfig.json` → expect 0 errors.
2. `cd apps/api && TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest --silent --runInBand --forceExit` (full unit suite) → all pass.
3. Re-run the predeploy smoke (Task 2 Step 5) on a fresh scratch DB to confirm migrate still green after all changes.
4. Commit any fixes.

---

## Task 11: Storefront widget (the one surface)

**Repo:** `/Users/alwyn/dev/mercur-storefront`. **Constraint:** the widget runs client-side and the spine is **same-origin** — call relative `/store/*` paths (NOT `MEDUSA_BACKEND_URL`), so cookies + same-origin hold. Confirm the storefront is served from the same origin as the backend in the deployed topology; if not, document the reverse-proxy/route needed (this is the CORS-killer the design depends on).

**Files:**
- Modify: `src/components/providers/TalkJs/TalkJsProvider.tsx` → `SpineProvider`
- Create: `src/components/spine/useThread.ts` (hook: exchange `?t=` once, poll `GET /store/messages?after=`, expose `messages` + `send()`)
- Modify: `src/components/cells/ChatBox/ChatBox.tsx` → render messages + input → `POST /store/messages`
- Modify: `src/components/sections/UserMessagesSection/UserMessagesSection.tsx` → thread view
- Modify: `src/components/molecules/MessageButton/MessageButton.tsx` → unread badge from `GET /store/thread`

**Step 1:** `useThread` hook — on mount, if `location.search` has `t`, `POST /store/session/exchange` then strip it from the URL. Poll `GET /store/messages?after=<lastId>` every 3s; append new messages to state. `send(text, context?)` → `POST /store/messages` with a generated `client_msg_id`; optimistically append; reconcile on poll.

**Step 2:** `ChatBox` — render `messages` (sender-styled bubbles; render `WebRenderer` action buttons as tappable, no-op for now or fire a follow-up message). Input box → `send()`. Keep the existing props (`order_id`/`product_id`/`subject`) → pass as `context`.

**Step 3:** `SpineProvider` wraps children, provides the thread context (so `MessageButton` badge + `ChatBox` share one poll).

**Step 4:** Local check: `npm run build` (or the repo's typecheck) → no type errors.

**Step 5: Commit**

```bash
git add src/components
git commit -m "feat(storefront): WRDO spine chat widget — fills TalkJS seams (WRDO-180)"
```

---

## Task 12: Acceptance (the locked checkbox)

**Manual, on a deployed/preview build:**
1. From WhatsApp, get a "continue on web" link (`/c?t=<token>` — wire a temporary way to mint one, e.g. a guarded admin route or the WhatsApp reply itself).
2. Open it on **phone** (WhatsApp in-app browser) AND **desktop**.
3. Send a message from web → confirm it lands in the same thread; send from WhatsApp → confirm it appears in the web widget within ~3s (one poll).
4. Confirm NO CORS error on desktop (same-origin). If CORS appears, the storefront is NOT same-origin with the API — fix the topology (this is the criterion the spike's desktop failure flagged).

**Document the result in the PR.** This checkbox is the slice's definition of done.

---

## PR

- Backend PR: `gh pr create --repo wrdo-development/mercur --base main --head feat/conversation-spine-WRDO-180 ...` (ALWAYS `--repo wrdo-development/mercur --base main` — gh defaults to the upstream parent on a fork; verify the URL host).
- Storefront PR: separate, against its own repo/remote.
- `Closes WRDO-180`.

## Risks / notes for the executor

- **Predeploy trap:** tribe-messages is the 2nd model-bearing module; model + migration MUST land together (Task 2). Re-smoke after all changes (Task 10).
- **Same-origin is load-bearing** (Task 11) — the whole "no CORS" acceptance depends on the widget calling relative paths and the storefront sharing the API origin. If the deployed topology splits them, that's a topology task, not a code task — surface it early.
- **Stubs stay stubs:** do NOT wire Letta/LiteLLM or Sockudo here. The compose is the existing stub; "receive" is polling. The durable channel+timestamp ledger is what makes future recall possible — that's the value this slice locks in.
- **Don't destabilise WRDO-179:** Task 7 (guest-first) touches the shipped persist path — keep it small + best-effort; split if it grows.
