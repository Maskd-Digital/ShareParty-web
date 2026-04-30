# ShareParty Web — Phase A foundation

Operator console built with **Next.js (App Router)** and **Supabase** (Postgres, Auth, Row Level Security, Storage, Realtime). See [BUILD_PLAN.md](./BUILD_PLAN.md) for the full product plan.

## Prerequisites

- Node 20+
- A [Supabase](https://supabase.com) project
- (Optional) [Stripe](https://stripe.com) test keys for Connect / BYO onboarding flows

## 1. Supabase setup

1. Create a project in the Supabase dashboard.
2. Run the SQL migration on the project (**SQL Editor** → paste file contents, or use CLI):

   - File: [`supabase/migrations/20260428000000_phase_a_foundation.sql`](./supabase/migrations/20260428000000_phase_a_foundation.sql)

3. **Auth → URL configuration**

   - Site URL: `http://localhost:3000` (or your deployed URL)
   - Redirect URLs: `http://localhost:3000/auth/callback` (add production callback when deployed)

4. Copy **Project URL** and **anon** / **service_role** keys into `.env.local` (see [`.env.example`](./.env.example)).

## 2. Local Next.js

```bash
cp .env.example .env.local
# Edit .env.local with real values

npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000): sign up, confirm email (Supabase Auth), complete **Onboarding** (library, payments branch, legal, go live).

### Encryption key (BYO Stripe)

Generate a stable secret for `ENCRYPTION_KEY` (e.g. `openssl rand -base64 32`). Required before saving library-owned Stripe keys.

## 3. Staging (recommended)

| Piece | Suggestion |
|-------|------------|
| Web | [Vercel](https://vercel.com) — connect repo, set env vars to match `.env.example` |
| Database / Auth | Supabase hosted project (same migration as local) |
| Stripe webhooks | Phase D — register endpoints per `BUILD_PLAN.md` |

After first deploy, run the migration on the hosted Supabase project if not already applied.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |

## Architecture (Phase A)

- **Tenancy:** `library_id` on library-scoped tables; **RLS** on `libraries`, `library_memberships`, `children`, and Storage objects (path prefix `{library_id}/...`).
- **Auth:** Supabase Auth; session refreshed in [`middleware.ts`](./middleware.ts).
- **Privileged work:** Stripe Connect / BYO encryption in **Route Handlers** under `src/app/api/`.
- **Onboarding:** `create_library` RPC creates library + operator membership; wizard in [`src/components/OnboardingWizard.tsx`](./src/components/OnboardingWizard.tsx).

## CI

GitHub Actions workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs lint, typecheck, and build with placeholder public env vars (override with real secrets only in deployment environments).
