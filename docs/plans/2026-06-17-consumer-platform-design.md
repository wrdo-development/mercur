# WRDO Consumer Platform — Design (2026-06-17)

> Brainstorm/design session for the whole consumer-facing platform — the future
> **wrdo.co.za** (today `shop.wrdo.co.za`, the `mercur-storefront` Next 15 app).
> Visual companion: FigJam board `RqeLBW2OpyZjFhLMFYv0K6`.
> Status: **design locked, build-ready.** Not yet built. Next step = build order.

This doc is the durable source of truth for the strategy decisions made in the
session. It sits alongside the conversation-spine docs in this folder — the spine
work (WRDO-180) is the load-bearing prerequisite and is already in flight.

---

## 0. THE MISSION (the why everything serves)

**WRDO gives small entrepreneurs and companies who can't compete with big tech the
tech and reach to actually succeed and become competitive against big tech.**

Big tech promised to democratise and instead built a **toll booth** — gave small
operators "reach" then taxed ~30% of their livelihood. WRDO inverts it: hands the
small operator the same weapons (app, payments, reach, trust, AI concierge) as an
**ally, not a landlord**. They don't pay WRDO to be permitted to exist; WRDO takes
a small cut *because it genuinely helped them win*. Toll booth vs partner.

**The mission IS the architecture** — low commission (they keep their money),
partner the taxi company don't absorb the drivers (lift the business), honest
pointer don't betray supply (loyal), estate distribution (reach), one engine many
hats (enterprise tech they couldn't afford).

**The mission is the DECISION FILTER.** When two paths look equal: *"Does this help
the small operator beat big tech, or make WRDO the new toll booth?"*

**The discipline:** a mission justifies the economics, it doesn't suspend them. The
most pro-small-operator thing is a WRDO durable enough to champion them for 20
years. Take enough to fund the recourse + survive (~8–15% floor), do the
POPIA/CPA/tax homework. The discipline is *how the mission survives*.

---

## 1. THE KEYSTONE — one engine, many hats

**WRDO is ONE engine (marketplace + booking + Pay + dispatch) wearing many HATS,
not many products.** Every offering is a cheap add-on to an owned spine:
- Rentals = a booking + a deposit
- Food = a listing kind + a fulfilment method
- Out-of-area products = the same sale + a courier
- Provider reach = a field + a PostGIS query
- Delivery = the ride dispatch already owned

**The money logic — low commission beats zero.** The expensive infra (rail, user,
trust, app) is already sunk cost, so every transaction through WRDO Pay is
near-100% margin on incremental commission *and* anchors the resident's payment
habit to WRDO. The cut isn't the point — **WRDO becoming the rail you pay
everything through is the point** (the moat).

**The flag — cheap to BUILD is not free to RUN.** Each hat has a trust/support/
liability tail. Rule: add offerings liberally BUT gate each on *"can we honour the
recourse / run the dispute flow for this?"* The constraint on # of hats is not
engineering effort — it's how many you can stand behind when one goes wrong.

---

## 2. THE VOICE — says what everyone's thinking

WRDO says what everyone's thinking but brands are too polished to say — bold,
opinionated, funny, direct, a real friend, not corporate mush. *"This local
vendor's cheaper than the big sites — support your neighbour."* / *"It's 35°, don't
walk 10km, grab a ride."* / *"Yeah I take a small cut — Echo's grooming bills don't
pay themselves."*

**Breaks the rules of corporate BLANDNESS, never the rules of HONESTY/law.** The
two never conflict — the bold thing and the honest thing are the same act.

**The flag:** the bold suggestion must serve the FRIEND's interest, never WRDO's
wallet. *"Don't walk in 35°"* = friend; *"grab a ride!"* for a 500m cool-day walk =
salesman. Boldness is **licensed by the times WRDO says NOT to spend** ("nice day,
just walk, save your money"). Vega Criterion 6 built into the voice.

---

## 3. ACCESS MODEL — public browse, login at the seam

| Public (no login) | Behind login (passwordless) |
|---|---|
| Listing exists, name, area, **price, deals**, rating, photos, crawlable hub pages | **Contact number** + **Book/Message/Buy** actions |

Price is PUBLIC (reversed mid-session) — the share-a-deal growth loop must be open.
Anti-bypass rests on **contact-gating**: price visible, "Book" routes through WRDO,
phone number never on a public page (POPIA + anti-scrape + transaction comes home).

**Auth / the spine:** "Login with WhatsApp" OAuth does NOT exist (Meta offers none).
The verified phone number IS the identity → signed **magic deep-link** binds web↔chat
to one `wrdo_users` record. Pair with Google OAuth (Medusa v2 native) + emailpass.
One person, many doors (`user_channel_identity`: whatsapp/google/web), channel-
agnostic, exists before login. **The magic-link is the load-bearing hinge** — now at
the Book seam. *(Being built now under WRDO-180: signed web-handoff token, phone as
cross-channel anchor, guest-first user creation.)*

---

## 4. OUT-OF-AREA — "no out-of-area, only not-yet"

Launching Val de Vie + Paarl. Anyone can chat to WRDO / sign up with any address.
**Never "not available in your area"** (breaks no-coming-soon + never-dead-end). A
Joburg user gets the FULL concierge:

1. **Provider service area is the PROVIDER's, not the platform's.** Three shapes:
   national (designer travels anywhere), multi-town/radius (Val de Vie shutter guy
   also does Wellington), hyperlocal (car guard). Match = *buyer ∈ provider's
   declared reach*. This is the **first** out-of-area answer (direct booking). New
   build = provider service-area field + PostGIS. Flags: travel cost transparent
   up-front (provider-set); reach provider-DECLARED never platform-inferred.

2. **Products have no service area — only a fulfilment method.** In-area = hyperlocal
   drop (hero, pay-at-the-drop). Out-of-area = courier (same sale, routes to TradeSafe
   escrow since pay-at-drop needs co-location). Only new build = courier integration
   (SA-native aggregator: Courier Guy/PUDO/Aramex SA, **not** Shippo) + honest
   landed-cost display.

3. **No WRDO supply anywhere** → finds-help: do the work (Google Places + HelloPeter
   reviews), surface the best, build user memory from message 1, recruit the supplier
   via a USER-initiated `wa.me` invite (WRDO never cold-contacts — POPIA s69 + Meta
   ToS). One conversation = 4 growth outputs (value/trust, user+demand record,
   supplier recruit, votes the next city). Same finds-help engine that runs in-area
   when supply is missing — out-of-area just fires it 100%.

---

## 5. CONVERSATIONAL GRAVITY + the honesty system

**Gravity:** WRDO chats freely like a friend (brainstorms, "show me a pic", has
opinions) but the conversation always bends toward buy/book/sell. Interior example:
"I need help with my interior" → "show me a pic" → brainstorm → "I know 2 designers
who work like this, want one lined up?" "Capital of France" is contextual, not
banned. The gravity test IS the ToS-safety test (general-assistant ban).

**Deflection ladder:** in-lane = full concierge; adjacent = bend home to a booking;
off-mission (homework) = honest hand-off ("that's a ChatGPT/Claude job — OR want me
to find you a tutor?"). Honesty = the brand + ToS-clean by construction + protects
token cost.

**Honest pointer (brand posture):** WRDO will point to Takealot/rivals when truly
better for the friend — the hardest-to-copy trust signal. 3 guardrails: own-house-
first; hedge the claim; **outbound pointers unmonetised** *for competing categories*.

**Affiliate (refined):** WRDO MAY earn on outbound referral IFF it's a category WRDO
doesn't/won't supply (hotels/flights via Agoda/Booking = concierge, no internal sale
to leak). NEVER on a category WRDO supplies (Takealot-for-a-couch). Test: "could WRDO
have fulfilled this itself?" Three referral types green: resident referral, provider/
vendor referral, outbound-concierge affiliate.

**Knowledge boundary:** WRDO speaks with authority about his own house (live data =
state as fact) and humility about everyone else's ("I'd be lying if I said I knew
what Takealot's got — here's the link, go check"). A LEGAL FIREWALL (never asserts an
external price → can't be wrong about it → no CPA exposure). Hard rule: **confidence
bound to data provenance** — internal = certain, external = mandatory hedge + link.

**Liability gradient:** what WRDO guarantees matches the provider's provenance.
Vetted-in-area = vouch; reach-extends-out = vouch provider, hedge territory;
external = disclaim entirely. Two legal musts: (1) disclaimer survives CPA only if
WRDO's role stays INTRODUCER not supplier (behaviour + T&Cs must agree); (2)
disclaimer lives IN THE CHAT at the moment of recommendation. WRDO guarantees not the
outcome but the **recourse** (the dispute flow). **SA attorney must review T&Cs before
launch.**

---

## 6. ECONOMICS — why WRDO takes less

Uber Eats/Mr D charge SA restaurants ~25–35% (many lose money, do it for exposure).
Uber's 30% isn't greed — it funds driver subsidies, customer acquisition, a national
trust+logistics machine among strangers. **WRDO doesn't carry those costs** (estate =
captive demand zero CAC; trust is the estate's; idle ride-drivers; app already built),
so it can charge ~8–15% and still make near-100% margin. **A moat made of math** —
Uber can't follow down without torching its own economics.

Three winners: restaurant keeps ~90%, resident pays less, WRDO earns near-pure margin
+ payment-habit lock-in. Flags: restaurants switch for ORDERS not lower fee (demand =
magnet, fee = multiplier); low commission must not mean worse experience; name a floor
(~8–15%) that funds the recourse; commission % in merchant agreement w/ VAT (IN 118).

---

## 7. RIDE — partner the taxi company, don't sign drivers

WRDO does NOT sign individual drivers (not Uber). It partners with an existing local
taxi company — signs **management** = one relationship. Co-brand **"WRDO x Paarl
Taxis"** = honest trust signal.

Kills 3 expensive problems: employment/contractor labour landmine (no WRDO–driver
relationship); logistics/vetting/PrDP/insurance/vehicle-compliance is the taxi co's
job; on-brand honesty.

**Risk moved, not vanished — MAKE-OR-BREAK clause:** WRDO outsources the driver but
NOT the resident's trust (a bad ride has WRDO's name on it). The agreement MUST give
WRDO teeth: flag/remove a driver from WRDO rides, SLAs, escalation. WRDO manages the
standard + recourse; the taxi co manages the driver. Pick a partner whose reputation
you'd be proud to wear. Money: payout to the taxi co (one payee, handles driver
splits) — WRDO never does per-driver payouts (another labour trap avoided).

**Same partner powers phase-2 food delivery** (idle driver delivers). One
partnership, two revenue lines, zero drivers on WRDO's books.

---

## 8. FOOD — order-and-collect first, delivery phase 2

Start = **order-and-collect** (deletes the hard delivery leg; all ordering value,
zero dispatch complexity; near-free = a listing kind + a fulfilment method on the
existing stack; `delivery_slot` kind already exists; the restaurant workflow = the
booking state machine, food-shaped). **Delivery = phase 2** via idle ride-drivers
(shared driver liquidity across rides AND food = structural edge Uber lacks). Flags:
food adds health-regulation + perishability (keep WRDO = introducer, the deli is the
food business); sequence collect-first; "Uber Eats for locals" = right vision, wrong
launch scope.

---

## 8b. INFORMATION ARCHITECTURE — one hub, role-filtered

**ONE login, ONE hub, ROLE-FILTERED.** Vendor and resident are MODES of one
identity, not separate apps. Dual-role users (the carpet-cleaner who rents machines
AND books a plumber) see both, automatically. One hub for all = no redesign per
persona. Signed-out = hub + explore (public/SEO); signed-in = personalised feed.

**Named sections (all locked):**
- **Discovery** — the feed/explore anchor (explore+SEO signed-out, personalised feed
  signed-in).
- **Trades** *(primary nav)* — buy, sell, rent, grab deals → Marketplace, Tickets,
  Vouchers, Deals, Coupons.
- **Hunts** *(primary nav)* — always subtitled "get a ride, order food, book a
  service". Name is clean (Hunt-the-trading-platform is leaving the WRDO platform).
- **Wallet/account zone (always-present, top corner, NOT primary nav):** 💳 **WRDO
  Pay** (the rail under everything) · ✨ **Sparks** (glanceable rewards balance) · 👤
  **Me** (profile + notifications).
- **My Stall** — business-mode toggle (changes who you are, not where you go).

**5 around-the-corner decisions:**
1. **Role-filter = SERVER-SIDE RBAC, not frontend-hidden.** "Same hub, different
   views" is a security boundary — a provider URL-tweaking into estate-internal data
   is a BREACH, not a UI bug. Frontend hides + backend enforces. (The plugin-3 RBAC
   need, now load-bearing.)
2. **My Stall = inline toggle + link-out.** Light reactive stuff (today's orders,
   mark-ready, live bookings) toggles INLINE = seamless. Heavy config (pricing/stock/
   payouts/calendar) = "Manage my shop" LINK-OUT to vendor.wrdo.co.za Mercur panel =
   already exists, no rebuild. (Full-inline rejected — it'd rebuild the Mercur panel =
   before-building-check sin + permanent drift.)
3. **Supply-gated nav.** Sub-items appear only when they have supply — Hunts shows
   rides+services at launch, food appears when a restaurant signs. Never a door onto
   an empty room.
4. **The Me/notifications zone is load-bearing** (orders, bookings, ride-status,
   provider messages, Sparks, disputes) = the front-desk "you" menu. Explicit in the
   IA, not a footnote.
5. **Two search boxes, context-separated.** Ask-WRDO bar (concierge — "find me a
   plumber") = the Discovery/hub hero. Product filter (refine a list) = inside
   Trades/marketplace. Two jobs, two contexts, not two competing bars.

---

## 8c. PAGE-BY-PAGE SECTION DESIGN

Through-line across every section: **one adaptive surface, the data declares the
variation** (chosen ~6× — listing-kind, price-model, operator-adapter, dispatch-
adapter, listing template, kind-adaptive My Stall). WRDO's signature move: **unify the
experience over a patchwork of real backends.**

### HUNTS — conversational-first, tap-mostly
Tapping Hunts/the ask-bar starts a WRDO conversation (uses the spine — same thread
across WhatsApp+web, WRDO remembers). **Conversational-FIRST, not -ONLY** — WRDO never
a slow chatbot making you type what a button would do faster. He talks (warm frame) but
hands structured shortcuts the instant they're faster (chips, "your usual" card, photo,
map pin). *Talk-first, tap-mostly, screens-if-you-want.* Landing = 3 supply-gated doors
+ ask-bar + active/recent + out-of-area variant.

- **Get a ride** — hybrid dispatch as ONE experience + pluggable **dispatch adapter**
  (partner-tech → hand request + poll; no-tech → WRDO Sockudo+PostGIS). Flow: where-to
  (chips) → pickup confirm → **co-brand moment** ("a ride with my friends at Paarl
  Taxis, ~R45, ~6min") → matching → matched + **shared live-track** → Pay (payout to
  taxi co, one payee) → rate + recourse (WRDO can flag a driver).
- **Order food** — order-and-collect first; menu = listing kind. Flow: craving? +
  supply-gated chips → pick place → menu → build order (honest total, gentle upsell) →
  collect confirm + code → Pay (low commission) → status via WhatsApp. Restaurant side
  = **order-intake adapter** (My Stall OR WhatsApp quick-reply buttons).
- **Book a service** — richest. Price model = a property of the listing
  (`fixed | quote | callout`). Flow: vague entry ("show me a pic") → WRDO scopes
  (urgency/photo/location) → **match branches by supply** (in-reach=vouch /
  no-reach=finds-help hedged) → price by type (quote = async Medusa-Quotes) → booking
  (8-state machine, provider via operator adapter) → on-my-way (shared live-track) +
  completion (photo proof) → two-way review + recourse. Flags: quote flow is **async**
  (needs a "waiting for quote" state); **liability gradient lives at the match moment**
  (provenance-aware match card renders the right disclaimer in WRDO's words by tier).

### THE OPERATOR ADAPTER (principle, applied 3×)
WRDO owns the resident experience identically; a thin per-operator adapter meets the
operator at **their tech level** (in-app / WhatsApp / manual). = the mission as
architecture — a WhatsApp-only deli is included, not excluded. "Tap-mostly not type"
applies to operators too (WhatsApp intake = quick-reply buttons).

### DISCOVERY — layered feed (all 3 logics, by intent)
**WRDO greets you → here's your stuff → here's what's alive near you.** Top =
WRDO-curated concierge greeting (the voice). Middle = your-stuff utility glance (the
dashboard people open the app for). Below = estate-pulse discovery (hyperlocal
deals/drops/providers/anonymised-neighbour-activity = infinite scroll + SEO surface +
density moat). Signed-out/SEO: no your-stuff, greeting=welcome, estate-pulse dominates.
Flags: empty-estate → feed degrades into WRDO voice, never an empty grid; neighbour
activity = privacy tightrope (aggregate/anonymise, opt-in, never expose what someone
bought).

### TRADES — one adaptive listing template, kind-driven (extend)
Shared core (photos, price-public, seller, reviews, share, contact-gate seam) + reads
`listing_kind` → product/second-hand/rental(+deposit+dates)/ticket/voucher/deal.
Landing = sub-categories + product-filter search (2nd box in-context). Sell/list-an-
item = vendor-lite on-ramp to My Stall. Flag: the **creation form** must be as
kind-adaptive as display (and is fiddlier — voucher regulatory guards, rental overlap).

### WALLET / ME ZONE — the front desk
WRDO Pay [manage surface — methods, history, **no stored balance** (SARB line),
tokenisation, PIN gate]. Sparks [loyalty wallet, official plugin engine]. Me/front
desk: **My Activity** = ONE unified timeline (everything WRDO did, the resident's
mental model not WRDO's taxonomy) — needs a **read-model aggregating** across separate
primitives (order + booking + rental + ride); Notifications (load-bearing); Messages/
Reviews/Wishlist/Addresses/Settings/Profile; Disputes (recourse).

### MY STALL — kind-adaptive vendor front desk
Inline light + link-out heavy (locked). Kind-adaptive (car guard simple, shop full,
plumber+seller both — Disney "meet them as they are" made structural). Home = vendor
front desk (Incoming / Today / quick actions) = the in-app arm of the operator adapter.
My Listings = kind-adaptive creation. "Manage my shop" → vendor.wrdo.co.za Mercur
panel. **Two dimensions of meet-them-where-they-are: tech level (operator adapter) +
business complexity (kind-adaptive view).**

---

## 9. HOMEPAGE — layered front door, NOT marketplace-first

- **Top:** WRDO front door — voice + ask/search bar ("what do you need?") + estate
  context ("You're in Val de Vie").
- **Middle:** the hats as a handful of strong doors (Shop/Book/Ride/Food/Rentals/Deals).
- **Below:** hyperlocal feed (near-you deals/drops/new providers) = the SEO+GEO+alive
  layer + where out-of-area adaptation lives.

**Do NOT make it marketplace-first** — a product grid shrinks WRDO into Takealot +
buries the differentiating hats. The marketplace is a ROOM reached via the Shop door,
not the front door. Flag: the feed needs content to not look empty at launch →
graceful degradation + WRDO voice fills gaps, never an empty shell.

---

## 10. PLATFORM READINESS (verified, not assumed)

- **Mobile:** responsive BUILT (82 files use breakpoints). Add explicit viewport.
- **App conversion:** no PWA/Capacitor yet. PWA (manifest+SW, reuses 100% code,
  SA-mobile-correct) or Capacitor wrapper. AVOID reviving the dead Expo app = a
  rewrite. (A separate RN app = a second codebase = exactly what to avoid.)
- **Push:** WhatsApp is the live tier-1 channel (~100% open, free). Web push rides the
  PWA service worker (tier 2, same workstream). Native FCM/APNs only if Capacitor.
  Engine = Medusa v2 notification module.
- **SEO:** good bones (generateMetadata, JSON-LD, robots.ts, next-intl). 🔴 BUG:
  robots.ts points to /sitemap.xml but NO sitemap.ts → 404. Add sitemap. Confirm
  `NEXT_PUBLIC_BASE_URL` in prod. Add hreflang for `[locale]` routing.
- **Analytics:** none. Next `@next/third-parties` GA tag, load after cookie consent.
- **AI-findability:** extend JSON-LD to Offer/Service/Review/LocalBusiness; add
  `llms.txt` (feeds buyer-side AI agents — "AI reads, transaction comes home").
- **Media optimization:** alt text (a11y+SEO+AI, must auto-generate for UGC), filename
  derive, WebP/AVIF (next/image already), **EXIF strip (POPIA — photos carry GPS)** +
  **SVG sanitize (XSS security)**.
- **Tracking:** GA4 events (instrument links/buttons); heatmap/replay via Microsoft
  Clarity (free, launch) or PostHog (self-host later); replay = PII, consent + masking.

**GEO/performance corrections (Gemini briefs):** INP target is **200ms not 150ms**;
2MB HTML limit irrelevant to this SSR+next/image setup; real CWV target = cheap
Android in WhatsApp webview, not desktop crawler; real INP risk = 100 `'use client'`
vs 27 server components → push components to server. **AI-bots: selective by SURFACE
not bot** — allow on public catalog (distribution), block + auth-gate personal/
behavioural (POPIA).

**OPEN:** filter→URL architecture — no searchParams filtering found yet; decide before
building the directory whether faceted views become clean crawlable anchors
(`/services/plumbers/sea-point`) vs client-only filters.

---

## 11. TESTING + QUALITY (verified)

- Backend: 52 Medusa integration tests. Canvas: 149 Vitest unit tests on money-logic.
  Canvas CI mature (Semgrep/SonarQube/Trivy/zizmor).
- 🔴 **storefront: ZERO tests + ZERO CI** (handles auth + payments — scariest gap).
- Add in order: (1) wire storefront into the security CI gate TODAY; (2) Playwright E2E
  on 5 money/trust flows; (3) **the SPINE continuity E2E** (WhatsApp webhook → state →
  magic-link → web, same thread = highest value, WRDO-specific, untestable otherwise);
  (4) Vitest+MSW component tier; (5) Playwright mobile-emulated config. NOT yet:
  Stryker/coverage while the surface still moves.

---

## 12. PLUGIN SWEEP — 28 items (only 2 adopt-worthy)

The whole sweep confirmed **WRDO already owns its spine** — almost nothing was
"wrap and ship". See `project_mercur_plugin_verdicts` memory for the full detail.

**Adopt:**
- **#9 `medusa-documents`** (RSC, MIT, real v2 module) → **FORK-AND-OWN** for invoices.
  Add SARS-VAT-compliant template + provider-attribution yourself. Near-term.
- **#20 `@medusajs/loyalty-plugin`** (OFFICIAL, lockstep with Medusa, MIT) → evaluate
  **adopt the engine** (earn/spend ledger) + put WRDO's Sparks experience on top.
  Use the points half; gift-card half = single-merchant closed-loop only (SARB line).

**The reference library:** the **official Medusa examples repo** ships maintained
implementations for nearly every hat — Product Rentals, Invoice Generator, Loyalty
Points, Restaurant Marketplace, Product Reviews, Re-order, Customer Tiers, Returns,
Wishlist, Quotes Management + Custom Item Price (the quote/lead model), Agentic
Commerce (the buyer-side-AI thesis), + official Meilisearch/Payload/Resend. **Build
each hat starting from the official example**, not scratch or a random plugin.

**Search:** Algolia InstantSearch UI + self-hosted **Meilisearch** (MIT) — but
Postgres search is fine at launch; defer Meili until the catalog grows.

**Regulatory line locked:** **NO WRDO-wide stored gift cards** (= SARB/e-money). WRDO
stays a facilitator. OK: single-merchant closed-loop voucher (money to merchant
direct, ring-fenced) + prepaid-for-a-specific-thing. OFF: pooled "WRDO credit".

**Skipped/filtered (SA-lean rule):** Stripe/PayPal/Twilio/Razorpay/BTCPay (geo);
Algolia-hosted/Contentful/Segment/Shippo/ShipStation (paid US SaaS — self-host or
SA-native alternative); archived/unlicensed/cold-start one-person plugins.

---

## 13. DEEP VERTICAL DESIGN (afternoon session)

### Hunts / Book — deep
- **Ride:** Uber-parity (live track, schedule, rate, tags, favourite, NO offline
  payments) + differentiators: regular-rider auto-discount (WRDO detects the pattern,
  offers a weekly rate — funded from a NAMED pool, never the driver's fare), airport
  runs (luggage + flight number for delay tracking), full-day special-request driver,
  security + report. **Price-check (legal):** never name a competitor; substantiated
  generic comparison only ("live data: ~R120 elsewhere, we ask R90") and ONLY with
  real logged data + keep the receipt (ARB Clause 4.1.1) — SA-attorney review.
  **Return trip:** both — airport/known round-trip offers now, else WRDO checks in
  later. **For someone else:** pay/initiate, WRDO loops the recipient in via WhatsApp
  (live-track on their phone) — the spine does what Uber can't.
- **Food:** Uber-Eats-parity + tip + tracker + NO offline pay. **Killer diff:
  multi-restaurant collect** (order from several places in one collect run).
- **Restaurant reservations:** a TABLE = a time-slot booking. **Reservation fee** =
  a refundable hold (reuses the rental-deposit primitive) — a no-show tool given to
  the restaurant + a commission line for WRDO.
- **Service:** richest — price model is a listing property (`fixed|quote|callout`);
  match branches by supply (vouch / finds-help hedged); quote flow is async; the
  liability gradient renders at the match moment (provenance-aware card). Each
  provider = a rich, **kind-adaptive business profile** (logo, price list, photos,
  worker profiles, deals, loyalty card, quote, book, their shop, T&Cs, location,
  Google reviews [phase-2 best-effort], references [POPIA: per-job opt-in, revocable,
  WRDO-mediated], social feed [phase-2], CIPC badge [VERIFIED not self-declared]).
  Users favourite + follow providers.
- **Event tickets (WRDO-NATIVE — Quicket killed):** a venue creates + sells its own
  tickets via the booking primitive + business profile + WRDO Pay (a ticket IS a
  booking). On-mission (no Ticketmaster, local keeps more). Lives under Book.

### THE RELATIONSHIP STRIP ("WRDO Remembers, made a place")
On EVERY business page, the user sees THEIR history with that business: last visit
(+ "you're due"), loyalty card, their reviews, invoices/warranty/docs, reminders,
wishlist, follows, next-appointment / when-to-rebook (WRDO reminds). The retention
moat: accumulated relationship history = a personal asset you'd lose by leaving.
= the per-business slice of the unified My Activity read-model.

### Trades — now 3 categories (Tickets moved to Book)
- **Shop** (new): brands via API + small entrepreneurs; pay online; send-gift;
  fulfilment = collect (free) / weekly WRDO-drop / delivery; each brand = own
  business profile.
- **Relics** (renamed from Second-Hand): reframes by what the item GAINED, unlocks a
  STORY field (trust + content + SEO); no business page (linked to user profile);
  TradeSafe escrow OR pay-immediately; delivery per-transaction.
- **Sundowners** (the deals section): one-day / specific-hour / weekly (business
  decides); "when the sun sets on SA, the deal is dead" — countdown in the name;
  legally cleaner than "OneDayOnly" (must honour real sunset literally).

### Sparks (regulatory)
Locked-safe model: WRDO-funded discount settled in Rands. New idea under review:
**Sparks-as-unlock** (Sparks unlock a merchant-pre-set special price; value floats
per-merchant so it reads as a loyalty-perk not currency) — probably safer but
substance-over-form risk → **top of the fintech-law review list, don't ship on
"probably."**

### COMMUNITY LAYER — the deepest moat (new pillar; design now, build phase 2)
WRDO = the neighbourhood's commerce (Trades) + services/logistics (Hunts/Book) +
**social fabric (Community)**. Commerce is switchable; community is not (leaving =
leaving your neighbourhood). Community is also the demand-gen engine for commerce.
Local events (free, Facebook-events style) + interest groups (padel club, buddy-
finder, book-a-court). **Neighbourhood-gated** (Drakenstein — bigger radius than
commerce, because social needs liquidity; *the gating radius differs by layer*).
Verified-resident-only; resident-led with WRDO guardrails (real identity + proximity
= self-moderation). **Killer unlock:** WRDO auto-creates "Neighbourhood Meet Up"
events from real venue happenings — solves the community cold-start problem; WRDO
seeds community. **Consent as a conversation:** WRDO asks the venue first when acting
on its behalf ("happy for me to auto-generate + fill this?"); suggests hedged when he
has no guarantee ("saw a thing at X, interested?"). Makes WRDO a proactive marketing
engine for local venues = the mission.

### The architectural law (chosen ~7×)
**Kind-adaptive everything** — one adaptive surface, the data declares the variation
(listing display, listing creation, price model, operator adapter, dispatch adapter,
My Stall, business profile). + WRDO's signature move: **unify the experience over a
patchwork of real backends** (spine, My Activity read-model, the adapters).

### Pre-launch legal/regulatory review list (accumulating)
T&Cs · liability gradient · substantiated price comparison · references feature ·
Sparks-as-unlock mechanism · reservation-fee/deposit handling. (SA attorney +
fintech-law review — a real pre-launch gate, not a design blocker.)

---

## Next step

Derive **build order** — what ships for the Val de Vie launch vs which hats come
later — from this design. Likely launch core: spine (in flight) + marketplace +
service booking + the layered homepage + access/auth + the platform-readiness fixes
(sitemap, viewport, CI gate, analytics). Later hats: rentals, food, ride, loyalty,
courier/out-of-area, deals/vouchers, **community (phase 2)**.
