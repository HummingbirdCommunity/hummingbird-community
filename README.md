# Hummingbird Community

A remote work community. This repository is scaffolded with the same base architecture as
VeraHire's `ai-job-assistant`, trimmed down to infrastructure only — enough to load a temporary
homepage.

## Stack

| Layer       | Technology                                                                              |
| ----------- | --------------------------------------------------------------------------------------- |
| Framework   | [Next.js 16](https://nextjs.org) (App Router, Turbopack) + React 19                     |
| Language    | TypeScript 5 (`@/*` path alias)                                                         |
| Styling     | Tailwind CSS 4 + `tw-animate-css`, [shadcn/ui](https://ui.shadcn.com) (new-york, slate) |
| Data / auth | [Supabase](https://supabase.com) (`@supabase/supabase-js`)                              |
| Data fetch  | [TanStack Query](https://tanstack.com/query)                                            |
| UI kit      | lucide-react icons, [sonner](https://sonner.emilkowal.ski) toasts                       |
| Tooling     | ESLint (next config) + Prettier (import sorting)                                        |
| Deploy      | Vercel · Node 22 (`.nvmrc`, engine-strict)                                              |

## Getting started

Requires Node 22 (see `.nvmrc`).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # fill in Supabase values (optional for the homepage)

# 3. Run the dev server
npm run dev                  # http://localhost:3000
```

The homepage loads without any environment variables. Supabase and other integrations become
active once their keys are set in `.env.local`.

## Scripts

| Command                   | Description                           |
| ------------------------- | ------------------------------------- |
| `npm run dev`             | Start the dev server (Turbopack)      |
| `npm run build`           | Production build                      |
| `npm run start`           | Serve the production build            |
| `npm run lint`            | Run ESLint                            |
| `npm run format`          | Format with Prettier                  |
| `npm run db:push:staging` | Apply migrations to the staging DB    |
| `npm run db:push:prod`    | Apply migrations to the production DB |
| `npm run db:diff`         | Diff local schema vs. migrations      |

## Project structure

```
src/
├── app/                  # Next.js App Router
│   ├── page.tsx          # Homepage
│   ├── login/            # Email + password sign in / sign up
│   └── dashboard/        # Protected page (profile + sign out)
├── components/
│   ├── QueryProvider.tsx # TanStack Query provider
│   └── ui/               # shadcn/ui components (button, card, input, label, sonner)
├── hooks/
│   └── useAuth.ts        # Client auth state (getSession + onAuthStateChange)
└── lib/
    ├── supabase/         # Supabase client (browser) + server (service role)
    └── utils.ts          # cn() and shared helpers

supabase/
├── config.toml          # Supabase CLI config
└── migrations/          # Versioned SQL migrations
```

## Auth

Email + password auth via `@supabase/supabase-js` (client-side session in
`localStorage`, matching the reference architecture):

- `/login` — sign in / sign up
- `/dashboard` — protected; redirects to `/login` when signed out
- On signup, a row in `public.profiles` is created automatically by a DB trigger.

> **Dev tip:** to skip the email-confirmation step during development, turn off
> _Confirm email_ under Supabase → Authentication → Providers → Email.

## Environments

|                     | Git branch              | Vercel            | Supabase project                 |
| ------------------- | ----------------------- | ----------------- | -------------------------------- |
| **Production**      | `main`                  | Production deploy | `mggqxpaxtewwyiyqmsrw`           |
| **Preview / local** | any feature branch / PR | Preview deploy    | `cywuejplvgajgtmevxrv` (staging) |

Vercel creates a preview deployment automatically for every branch/PR. Set the
staging Supabase values in Vercel's **Preview** scope and the production values
in the **Production** scope (`NEXT_PUBLIC_*` values are inlined at build time).

Typical flow:

```bash
git checkout -b feature/xyz
# ...changes + any new supabase/migrations/*.sql
npm run db:push:staging       # apply schema to staging first
git push -u origin feature/xyz  # Vercel builds a preview URL (staging DB)
# open a PR, test on the preview URL, then merge to main → production deploy
npm run db:push:prod          # apply the same migration to production
```

## Database & migrations

Schema is managed with the Supabase CLI under `supabase/migrations/`. The
`db:push:*` scripts read the target DB password from `.env.local`
(`STAGING_DB_PASSWORD` / `PROD_DB_PASSWORD`) and apply pending migrations.

The first migration (`init_profiles`) creates `public.profiles` with RLS
(public read, self-write) and the signup trigger.

## Planned add-ons

The following are part of the reference architecture but intentionally left unwired for now.
Add the relevant keys to `.env.local` and install the packages when you need them:

- **Sentry** — error monitoring (`@sentry/nextjs`)
- **PostHog** — product analytics (`posthog-js`)
- Email, and any product-specific features
