# ShareParty — Operator Web Application Build Plan

This plan is derived from the **ShareParty 25-Day MVP Build Plan** (April 2026 pilot) and narrows scope to a **web-first operator console**: library setup, catalogue (items/toys), members, loans and returns, reservations and waitlist (operator-side controls), payments and billing integration, notifications, and compliance hooks. Member-facing experiences are included only where operators cannot run a pilot without them (minimal flows and APIs).

**Primary surface:** Next.js (App Router) operator UI backed by **Supabase** (Postgres + Auth + Storage + Realtime), multi-tenant by `library_id` via **RLS** and application context.

**Returns and AI condition inspection:** Return photos are **captured and uploaded from the mobile app** (member or staff flow per product spec). The **operator web console** is where those images land for review: outgoing (loan) photos beside incoming return photos, **AI image match / condition-delta analysis** triggered and displayed, and operator decisions (no charge / damage fee / flag) recorded. The API and storage model must treat return media as **mobile-origin, web-facilitated** — same `ConditionRecord` (or equivalent) whether the client is Expo or browser.

---

## 1. Goals and success criteria

| Goal | Verification |
|------|----------------|
| Operators can onboard a library end-to-end | Fresh account completes onboarding (account → locale → library settings → Stripe Connect → legal acknowledgements → go-live URL) in under 30 minutes |
| Operators can manage the catalogue at scale | CRUD, photos, status machine, colour labels, import from SETLS / MiBase NZ templates |
| Operators can run day-to-day lending | Issue and return loans, inspect condition on return, handle damage fee decisions |
| Operators can manage members and money | Member records, subscriptions/billing via Stripe, webhook-driven membership state |
| Operations stay coherent under load | **Supabase Realtime** (or equivalent) for availability; server-side rejection of invalid state transitions and reservation conflicts |

---

## 2. Operator capability map

The web app should expose these **operator domains** (each maps to modules, routes, and permissions in the existing MVP architecture).

### 2.1 Library and organisation

- Multi-tenant routing (library slug / subdomain) and strict `library_id` scoping on all reads and writes.
- Operator onboarding wizard: account, locale, library type and settings, Stripe Connect, DPA / COPPA operator acknowledgements, go-live URL.
- Localisation framework on the web app from the first screens: currency (minor units + ISO code), date formats, `react-i18next` (or equivalent) so operator-facing copy and formats are not retrofitted later.

### 2.2 Catalogue (items / toys)

- Full **toy catalogue CRUD**: create, edit, retire; **Supabase Storage** uploads (signed URLs); optional QR display/download (PDF label printing can stay V2 per original plan).
- **Colour status system** (Green / Amber / Red / Grey) with mandatory **text labels** (e.g. Ready / Needs Review / Not Available / Stock Photo) — WCAG: never colour alone.
- **Toy status state machine** enforced in **Postgres / RPC / Next server routes**: Available → Reserved → On Loan → Under Inspection → Available or Retired; invalid transitions return clear errors.
- **AI-assisted ingest** (core differentiator): model-agnostic AI service; web flow should support photo upload (1–4 images) → identification → operator confirmation form; store structured fields and alt text (operator-editable).
- **CSV migration**: SETLS and MiBase NZ parsers only — preview, confirm, import catalogue, members, loan history; imported toys flagged as stock photo where appropriate.

### 2.3 Members

- Operator views and tools for member records tied to the library (search, detail, loan history as needed for pilot).
- Children’s data **minimisation** (age + optional name) and flows that respect deletion independent of parent account where required by product/legal rules from the MVP spec.
- COPPA-related UX for US-facing contexts (consent / notices) must exist before live operators; exact split between operator-only vs member self-serve can follow MVP, but **data rules cannot be an afterthought**.

### 2.4 Loans, reservations, and waitlist (operator lens)

- **Loan issuance and return** from the operator dashboard (e.g. quick loan / quick return entry points).
- **Return pipeline (mobile capture + web analysis):**
  - **Mobile app:** scan QR / identify loan, capture 1–4 return photos, upload via **Storage** signed URL; Postgres marks the return as ready for inspection and attaches media to the loan/condition record.
  - **Operator web:** when return photos are present (or on refresh via **Realtime**), show **side-by-side** (or stacked) view — outgoing condition + piece count from loan vs new return images — then run **AI condition inspection** (same vision stack as MVP: delta assessment, damage observations, confidence, recommendation). Store **raw AI response** permanently.
  - **Operator web:** explicit actions — no charge, damage fee, flag — with colour assignment per acceptance criteria; optional **web-only** fallback to upload return photos for edge cases (e.g. device failure) should not replace the primary mobile path.
- **Reservations**: server-enforced holds (e.g. 48-hour window after next open session); concurrent attempts must fail fast and predictably.
- **Waitlist (pilot scope)**: members may join a queue; **operators manually advance** the queue; position visibility can be member-facing minimally if needed for pilot.

### 2.5 Payments and Stripe

- **Stripe Connect** for operator onboarding and payouts.
- **Member subscription billing** (Customer Portal where members self-manage billing per MVP).
- **Webhooks**: `payment_failed`, subscription deletion, `invoice.paid` (and related) → membership status sync; **idempotent** handlers.
- **Damage fee flow**: operator decision → charge on member payment method → notification including evidence photos.

### 2.6 Notifications and real time

- **Supabase Realtime**: library-scoped channels; toy status and availability events targeting under 2 seconds propagation (per MVP spec).
- **Queue-backed jobs** (Edge Functions + external queue or pg-based): all outbound notifications fan out from a pipeline — no fire-and-forget email sends from request handlers alone.
- **Transactional email** (minimum five events): loan confirmed, overdue reminder, damage fee charged, reservation ready, billing event — MJML + provider (e.g. Postmark).
- **In-app notification centre** for operators (bell, read state), delivered via **Realtime**.
- Email compliance basics: unsubscribe on non-transactional mail, physical sender address, marketing opt-in only.

### 2.7 Dashboard and operational UX

- Operator **home**: today at a glance, action queue (e.g. Amber / needs review), quick actions, recent activity fed by real APIs.
- Search, filters, and bulk-friendly patterns for catalogue and members as pilot scale grows (RLS-scoped queries from Next.js).

---

## 3. Scope relative to the full 25-day MVP

### 3.1 In scope for this operator-web focus

Everything in section 2, plus shared foundation: **Supabase** SQL schema (Library **including `billing_mode` and encrypted BYO Stripe fields** where used, User/Member profiles, Toy, Loan, ConditionRecord, Reservation, WaitlistEntry, NotificationLog, Payment, etc.), **Supabase Auth** + **RLS** for operator/member, COPPA/children data minimisation, Stripe Connect + webhooks and BYO paths (Next **Route Handlers** / Edge), **Realtime**, queue-backed email, AI ingest and inspection, **mobile return upload** (same Storage + Postgres tenancy as web), CSV importers, E2E tests on **operator-critical paths** (include at least one library in each billing mode where applicable), manual WCAG pass on **operator surfaces**.

### 3.2 Adjusted or de-emphasised for a web-only operator build

| Original MVP item | Operator-web adjustment |
|-------------------|-------------------------|
| Expo camera for AI ingest | Implement **web upload** to **Supabase Storage** + same AI pipeline (Route Handler / Edge) for **catalogue ingest**; optional later mobile ingest if needed |
| Expo camera for **returns** | **Keep mobile** as the primary capture surface; photos sync to shared storage; **operator web** runs comparison UI + AI analysis + fee decision (no requirement to re-shoot returns on desktop) |
| Member portal polish | Ship **minimal** member routes (catalogue browse, reserve, My Shelf, account/portal) only as needed for operators to test end-to-end; deep UX iteration can trail operator console |
| Native push (FCM/APNs) | Out of scope until native apps exist |

### 3.3 Explicitly deferred (unchanged from source plan)

Multi-region AWS, data residency tooling beyond pilot needs, GDPR/CASL package, AI CSV column mapping for arbitrary formats, automated stock photo enrichment, operator analytics dashboard, QR PDF Brother QL, full audit log, full 14+ notification matrix, waitlist auto-advance, volunteer roles, white-label, multi-location, Stripe Tax (US), VPAT/penetration/SOC2, etc.

---

## 4. Phased delivery (operator-first ordering)

Hours are indicative (5–6 focused hours/day); total effort remains in the **~100–140 hr** band for a full pilot-ready stack, but **operator UI work can be front-loaded** so the console is usable early.

### Phase A — Foundation (aligns to original Week 1)

1. Next.js operator app + **Supabase** project, CI scaffold (optional Turborepo).
2. Full **SQL** schema, RLS, and migrations.
3. **Supabase Auth**, email verification, roles, age gate.
4. Multi-tenancy and operator onboarding (steps through go-live URL).
5. Localisation + Stripe Connect steps in onboarding.
6. COPPA / children field rules + auth edge cases; deploy Phase A to staging before heavy catalogue work.

### Phase B — AI and catalogue (highest schedule risk)

1. Model-agnostic AI service + **Storage** signed URLs; structured JSON contract for ingest.
2. **Dedicated prompt iteration** block against real toy photos (target above 85% on branded set before locking UX).
3. Operator web: ingest confirmation form, catalogue CRUD, colour + status machine, dashboard shell wired to real data.
4. CSV import (SETLS + MiBase NZ).

### Phase C — Lending, inspection, concurrency

1. Loan and return flows: mobile APIs for return photo upload; operator web **return inspection** screen (poll + **Realtime** when new images arrive); AI condition inspection and operator decision + persistence of raw model output.
2. **Realtime** channels and library-scoped events; reservation conflict behaviour server-side; notify operator UI when a mobile return upload completes so analysis can proceed without manual refresh.

### Phase D — Members, minimal member web, payments

1. Member management in operator UI; minimal member portal routes required for reservations and billing smoke tests.
2. Stripe Customer Portal, damage fee charge path, subscription webhooks and idempotency.

### Phase E — Notifications, hardening, launch

1. Central queue/event pattern + five transactional templates + in-app operator notifications (**Realtime**).
2. E2E tests: ingest, loan, return, inspection, reservation conflict, payment failure path.
3. Manual WCAG on operator flows; pilot checklist from MVP doc.

---

## 5. Non-negotiables (operator web cannot launch without)

- Auth, multi-tenancy, and locale/currency framework completed before large UI build-out.
- Toy **state machine** correctness in **Postgres / server routes** (not client-only).
- AI ingest + **return condition inspection on web** (photos from mobile, analysis and decisions on operator web, stored evidence) — product differentiator.
- Stripe Connect + webhook correctness for membership and failures.
- **Supabase Realtime** for availability / conflicts.
- COPPA + minimal children data model.
- Transactional email baseline (five events) via queue-backed dispatch.

---

## 6. Risks and where to spend human time

| Risk | Mitigation |
|------|------------|
| AI vision accuracy | Fixed calendar block for prompt + eval on real photos; do not compress |
| Reservation race conditions | Automated or manual two-client tests from day one of **Realtime** feature |
| Stripe Connect / webhook edge cases | Idempotency keys, structured logging, Stripe CLI simulations |
| WCAG | Text labels for every colour-coded state; keyboard path on operator dashboards |

---

## 7. Operator-focused launch checklist (condensed from MVP)

- [ ] Operator onboarding timed run (under 30 minutes).
- [ ] AI ingest meets agreed accuracy bar on a frozen photo set.
- [ ] Full cycle: ingest → loan → **mobile return upload** → **web AI inspection + operator decision** → fee (if applicable) → email.
- [ ] Two-browser reservation conflict behaves correctly.
- [ ] Stripe Connect test payout and subscription renewal in test mode.
- [ ] Simulated `payment_failed` blocks member access appropriately.
- [ ] COPPA / child delete flows verified for US-locale scenario.
- [ ] Operator screens: labels, alt text, keyboard navigation.
- [ ] Critical emails render in major clients.
- [ ] **Realtime** latency within agreed threshold under manual test.
- [ ] Staging stability burn-in; pilot operator hardware and briefing confirmed.

---

## 8. Cursor / execution discipline (from source plan)

- One module per session (one route, one RLS policy set, or one major component).
- Review outputs before stacking dependent work; fix auth/tenancy/locale before Phase B.
- No implementation time on deferred features (analytics, QR PDF, etc.).
- All notifications through the central event bus once Phase E begins.

---

*Source: ShareParty 25-Day MVP Build Plan (v1.0, 2026). This document reframes that schedule for a web-centric operator product without replacing the original programme-of-record for mobile and full member portal delivery.*
