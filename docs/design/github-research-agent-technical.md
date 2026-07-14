# GitHub Research Agent - Technical Design

> Status: Draft v2 (original design) | Date: 2026-07-12
> **As-built through Phase 2 (HB-18/19/20/21)** | Updated: 2026-07-14
>
> ⚠️ The sections below (§3–§12) capture the **original design intent**. The
> implementation diverged on several deliberate calls — see
> **§0 Implementation Status** for what is actually built. Where a later section
> conflicts with §0, §0 wins.

---

## 0. Implementation Status (As-Built)

This section is the source of truth for the current system. The rest of the doc
is retained for design history and rationale.

### 0.1 What shipped

| Ticket | Scope | Status |
|--------|-------|--------|
| HB-18 (Phase 0) | Agentic tool-calling investigation loop — end-to-end vertical slice | ✅ Done |
| HB-19 | Multi-provider OpenAI-compatible LLM fallback chain | ✅ Done |
| HB-20 (Phase 1) | Requester-token auth, DB persistence, history list | ✅ Done (PR #16) |
| HB-21 (Phase 2) | Deep data collection + evidence-backed rich schema | ✅ Done (this change) |

### 0.2 Architecture: agentic loop, not a fixed pipeline

The original design (§3) described a fixed 5-step pipeline
(`collect-profile → analyze-repos → analyze-contributions → analyze-cross-repo → synthesize`).
**As built, the agent is an LLM-driven tool-calling loop** ([`src/lib/agent/workflow.ts`](../../src/lib/agent/workflow.ts)):

1. **Gathering** — the LLM decides which tools to call, in what order, until it
   has enough evidence (bounded by `MAX_TURNS = 12`). Each LLM call and each tool
   execution is a durable Vercel Workflow step.
2. **Synthesis** — a separate LLM call with a JSON-schema `response_format`
   produces the structured summary. Output is validated at runtime with zod, so a
   provider that ignores the schema can't corrupt the result.

This is the design doc's §13.5 "DurableAgent" direction, chosen over the rigid
pipeline for flexibility.

### 0.3 LLM: multi-provider fallback (not the Gemini SDK)

Supersedes §4. There is no `@google/genai` dependency and no `gemini.ts`. Instead
[`src/lib/agent/llm.ts`](../../src/lib/agent/llm.ts) exposes an ordered chain of
**OpenAI-compatible** providers, configured via `LLM_PROVIDERS` (e.g.
`gateway,gemini,openrouter`). On a `429/402/403` the workflow falls back to the
next provider; synthesis additionally falls back on malformed/invalid JSON.
`response_format: json_schema` downgrades to `json_object` automatically for
providers that don't support it.

### 0.4 Auth: requester's OAuth token (no dedicated agent PAT)

Supersedes §5.1. **`GITHUB_AGENT_TOKEN` is intentionally NOT used.** Tool calls
authenticate with the *requesting* user's connected GitHub OAuth token (HB-6),
decrypted inside the workflow step ([`src/lib/github/token.ts`](../../src/lib/github/token.ts))
so plaintext never enters durable state. Investigations run at 5,000 req/hr;
when the requester hasn't connected GitHub we fall back to anonymous REST
(60 req/hr) and GraphQL-backed tools return a graceful "connect GitHub" error.

### 0.5 Tools (as built)

Defined in [`src/lib/agent/steps/investigate.ts`](../../src/lib/agent/steps/investigate.ts):

| Tool | Source | Notes |
|------|--------|-------|
| `get_github_profile` | REST `/users/{u}` | Identity, tenure, reach |
| `get_top_repos` | REST `/users/{u}/repos?sort=stars` | Breadth signal |
| `get_signature_repos` | GraphQL, reuses [`signature.ts`](../../src/lib/github/signature.ts) | Pinned + top-starred |
| `get_contributions` | GraphQL, [`contributions.ts`](../../src/lib/agent/contributions.ts) | **Participation-weighted languages** (see §0.6) |
| `search_cross_repo_prs` | REST Search API | External PRs (owner ≠ user) |

### 0.6 Participation-weighted language proficiency

The key skill-assessment signal. Raw byte stats (`/languages`) measure *codebase
size*, not the user's own effort — one commit to a huge C repo would read as
"97% C". Instead `get_contributions` ranks languages by the user's **own commit
counts per repository** (`contributionsCollection.commitContributionsByRepository`),
sampling up to 3 representative years to bound API spend. The pure helper
`weightLanguagesByParticipation` is unit-testable in isolation. The synthesis
prompt instructs the model to trust this over raw repo languages.

### 0.7 Output schema (as built)

Supersedes the `DeveloperProfile` schema in the requirements doc §3. The shipped
shape is `DeveloperSummary` in [`src/lib/agent/types.ts`](../../src/lib/agent/types.ts)
(zod-validated), with **evidence links** on every claim:
`headline`, `career_stage`, `strengths[]`,
`languages[{name, proficiency, evidence}]`,
`domains[{name, depth, evidence}]`,
`notable_repos[{name_with_owner, role, stars, url, reason}]`,
`external_contributions[{repo, url, description}]`, `data_quality_notes[]`.

### 0.8 Known gaps / follow-ups

- **No automated tests yet** — `weightLanguagesByParticipation` is written as a
  pure function for exactly this, but vitest isn't set up. Tracked as a follow-up.
- **GraphQL tools require the requester to have connected GitHub** (by the §0.4
  decision); anonymous investigations get REST-only depth.
- Byte-based language distribution (existing [`languages.ts`](../../src/lib/github/languages.ts))
  is not yet wired in as a complementary breadth signal.

---

## 1. Architecture Overview

```
    ┌─────────────────────────────────────────────────────────┐
    │  Hummingbird Web App (Next.js 16 App Router)            │
    │                                                         │
    │  ┌──────────────────────────┐  ┌─────────────────────┐  │
    │  │  (app) Route Group       │  │  API Routes          │  │
    │  │  ┌────────┐ ┌─────────┐ │  │  /api/github/*       │  │
    │  │  │Sidebar │ │ Pages   │ │  │  /api/agent/*  (new) │  │
    │  │  │ Profile│ │         │ │  └──────────┬────────────┘  │
    │  │  │ Explore│ │ /invest │ │             │               │
    │  │  │ MyProj │ │ igate/* │ │  ┌──────────▼────────────┐  │
    │  │  │►Invest │ │         │ │  │  Vercel Workflow       │  │
    │  │  └────────┘ └────┬────┘ │  │  (Orchestrator)        │  │
    │  └──────────────────┼──────┘  └──────────┬────────────┘  │
    │                     │                    │               │
    │              stream via           step calls             │
    │              getReadable()               │               │
    │                     │         ┌──────────▼────────────┐  │
    │                     │         │  Step Functions        │  │
    │                     │         │  ┌──────────────────┐  │  │
    │                     │         │  │ GitHub API       │  │  │
    │                     │         │  │ (reuse http.ts,  │  │  │
    │                     │         │  │  signature.ts,   │  │  │
    │                     │         │  │  languages.ts)   │  │  │
    │                     │         │  ├──────────────────┤  │  │
    │                     │         │  │ Gemini API       │  │  │
    │                     │         │  ├──────────────────┤  │  │
    │                     │         │  │ Supabase         │  │  │
    │                     │         │  └──────────────────┘  │  │
    │                     │         └────────────────────────┘  │
    └─────────────────────┼────────────────────────────────────┘
                          │
                 ┌────────▼─────────┐
                 │  User's Browser   │
                 │  (streaming UI)   │
                 └──────────────────┘
```

**Current app structure context**: The app uses an `(app)` route group (HB-16) with a sidebar navigation (Profile, Explore, My Project). Investigation becomes a 4th sidebar item. Existing GitHub helpers (`http.ts`, `signature.ts`, `languages.ts`) can be reused by the agent.

**Key design decision**: Everything lives in the same Next.js app and Vercel project. No separate microservice or monorepo needed for v1. The workflow runs as Vercel Functions within the existing deployment.

---

## 2. Monorepo vs. Single App

### 2.1 Recommendation: Stay Single App for Now

The current codebase is a single Next.js app with an established `(app)` route group, sidebar shell, and growing feature set (HB-15/16/17). Adding an agent does not justify a monorepo split. Reasons:

| Factor | Single App | Monorepo |
|--------|-----------|----------|
| Complexity | Low — one `package.json`, one deploy | High — Turborepo config, workspace deps, separate builds |
| Shared code | Direct imports (`@/lib/...`) | Need shared packages with proper exports |
| Deployment | One Vercel project | Multiple Vercel projects or complex build targets |
| Dev experience | `npm run dev` starts everything | Need `turbo dev` with task orchestration |
| Agent isolation | Workflow steps are already isolated | Would be isolated at package level |

### 2.2 Proposed Directory Structure

Add agent code alongside existing app code, fitting into the `(app)` route group and reusing established GitHub helpers:

```
src/
├── app/
│   ├── [locale]/
│   │   ├── (app)/                       # Existing: authenticated shell with sidebar
│   │   │   ├── layout.tsx               # Existing: AuthGate + Header + Sidebar
│   │   │   ├── profile/                 # Existing: user profile (was /dashboard)
│   │   │   ├── explore/                 # Existing: project directory
│   │   │   ├── my-project/              # Existing: user's projects
│   │   │   └── investigate/             # NEW: investigation feature
│   │   │       ├── page.tsx             # Search/trigger page
│   │   │       └── [runId]/
│   │   │           └── page.tsx         # Investigation result page (streaming)
│   │   └── ...
│   └── api/
│       ├── github/                      # Existing: OAuth, languages, signature
│       │   ├── authorize/
│       │   ├── callback/
│       │   ├── status/
│       │   ├── languages/               # Existing: reuse for agent Phase 2
│       │   └── signature/               # Existing: reuse for agent Phase 2
│       └── agent/                       # NEW: agent API routes
│           ├── investigate/
│           │   └── route.ts             # POST: start investigation
│           └── stream/
│               └── route.ts             # GET: stream run output
├── lib/
│   ├── github/                          # Existing GitHub lib (expanded)
│   │   ├── oauth.ts                     # Existing: OAuth token exchange
│   │   ├── crypto.ts                    # Existing: token encryption
│   │   ├── session.ts                   # Existing: auth helpers, impersonation
│   │   ├── http.ts                      # Existing: USER_AGENT, timeouts, rate-limit
│   │   ├── errors.ts                    # Existing: GitHubApiError
│   │   ├── languages.ts                 # Existing: language aggregation (reuse)
│   │   ├── signature.ts                 # Existing: pinned/top repos (reuse)
│   │   ├── client.ts                    # Existing: browser-side fetch wrappers
│   │   └── graphql.ts                   # NEW: shared GraphQL client for agent
│   ├── agent/                           # NEW: agent core
│   │   ├── workflow.ts                  # Workflow definition
│   │   ├── steps/                       # Step functions
│   │   │   ├── collect-profile.ts
│   │   │   ├── analyze-repos.ts         # Can call existing languages.ts logic
│   │   │   ├── analyze-contributions.ts
│   │   │   ├── analyze-cross-repo.ts
│   │   │   └── synthesize.ts
│   │   ├── prompts.ts                   # LLM prompt templates
│   │   ├── types.ts                     # TypeScript types for profile schema
│   │   └── gemini.ts                    # Gemini API client wrapper
│   └── supabase/                        # Existing
├── components/
│   ├── app-shell/                       # Existing: AuthGate, Header, Sidebar
│   │   ├── Sidebar.tsx                  # MODIFY: add "Investigate" nav item
│   │   └── ...
│   └── investigation/                   # NEW: investigation UI components
│       ├── InvestigationForm.tsx
│       ├── InvestigationProgress.tsx
│       └── DeveloperProfile.tsx
└── ...
```

### 2.3 Reusing Existing GitHub Code

The codebase already has significant GitHub data analysis. The agent should **reuse, not duplicate** this logic:

| Existing Module | What It Does | Agent Reuse |
|-----------------|-------------|-------------|
| `lib/github/http.ts` | `USER_AGENT`, `REQUEST_TIMEOUT_MS`, `isRateLimitError()` | All agent HTTP calls use these |
| `lib/github/languages.ts` | Aggregates language bytes across repos (REST, concurrent) | Agent Phase 2 calls this for the target user |
| `lib/github/signature.ts` | Fetches pinned + top-starred repos (GraphQL) | Agent Phase 2 calls this for the target user |
| `lib/github/session.ts` | `resolveTargetUserId()`, `getUserFromRequest()` | Agent API routes use these for auth |
| `lib/github/errors.ts` | `GitHubApiError` class | Agent steps throw/catch this |

Key difference: existing helpers use the **user's own OAuth token** (from `github_connections`). The agent needs to work for **any GitHub username**, even those not connected to Hummingbird. So:
- For Hummingbird-connected users: can reuse their token (higher personal rate limit)
- For external usernames: use the dedicated `GITHUB_AGENT_TOKEN` (server-side PAT)

The `graphql.ts` module should be a new shared client that accepts a token parameter, usable by both existing features and the agent.

### 2.3 When to Split into a Monorepo

Migrate to Turborepo monorepo when ANY of these conditions are met:
- A second agent type is added (e.g., LinkedIn agent, StackOverflow agent)
- The agent needs to run as a standalone service (different scaling characteristics)
- Multiple teams work on agent vs. web app independently
- Agent dependencies conflict with web app dependencies

When that happens, the split would look like:

```
packages/
├── web/                  # Current Next.js app
├── agents/
│   ├── github-agent/     # GitHub investigation agent
│   └── shared/           # Shared agent utilities
└── config/               # Shared ESLint, TypeScript configs
```

---

## 3. Vercel Workflow Implementation

### 3.1 Why Vercel Workflow

- **Durability**: Agent investigation takes 1-5 minutes with many external API calls. Vercel Workflow persists state across function invocations — if a function times out or crashes, it replays from the last completed step.
- **Streaming**: Real-time progress updates to the browser via `getWritable()` / `getReadable()`.
- **Sleep & retry**: Built-in `sleep()` for rate limit handling, automatic step retries for transient errors.
- **No infrastructure**: Runs on the same Vercel deployment. No Redis, no queue service, no separate worker.
- **Observability**: Built-in run inspection via `npx workflow web`.

### 3.2 Workflow Definition

```typescript
// src/lib/agent/workflow.ts
import { sleep } from "workflow";
import { getWritable } from "workflow";
import type { InvestigationProgress, DeveloperProfile } from "./types";

// Step imports
import { collectProfile } from "./steps/collect-profile";
import { analyzeRepos } from "./steps/analyze-repos";
import { analyzeContributions } from "./steps/analyze-contributions";
import { analyzeCrossRepo } from "./steps/analyze-cross-repo";
import { synthesizeProfile } from "./steps/synthesize";
import { saveProfile } from "./steps/save-profile";

export async function investigateGitHubUser(username: string) {
  "use workflow";

  const writable = getWritable<InvestigationProgress>();

  // Phase 1: Collect basic profile
  const profile = await collectProfile(username, writable);

  if (!profile) {
    return { error: "User not found", username };
  }

  // Phase 2: Analyze repositories
  const repoAnalysis = await analyzeRepos(
    username,
    profile.publicReposCount,
    writable
  );

  // Phase 3: Contribution deep-dive (multi-year)
  const contributions = await analyzeContributions(
    username,
    profile.contributionYears,
    writable
  );

  // Phase 4: Cross-repo activity
  const crossRepo = await analyzeCrossRepo(username, writable);

  // Phase 5: AI synthesis
  const developerProfile = await synthesizeProfile({
    profile,
    repoAnalysis,
    contributions,
    crossRepo,
  }, writable);

  // Save to database
  await saveProfile(username, developerProfile);

  return developerProfile;
}
```

### 3.3 Step Function Example

```typescript
// src/lib/agent/steps/collect-profile.ts
import { getWritable } from "workflow";
import { queryGitHubGraphQL } from "@/lib/github/graphql";
import type { InvestigationProgress, RawProfile } from "../types";

const PROFILE_QUERY = `
  query($login: String!) {
    user(login: $login) {
      name bio company location email isHireable pronouns
      websiteUrl twitterUsername createdAt
      socialAccounts(first: 10) { nodes { provider url } }
      followers { totalCount }
      following { totalCount }
      organizations(first: 20) { nodes { login name } }
      pinnedItems(first: 6) {
        nodes {
          ... on Repository {
            nameWithOwner description stargazerCount
            primaryLanguage { name }
          }
        }
      }
      repositories(first: 1) { totalCount }
      contributionsCollection { contributionYears }
      isCampusExpert isDeveloperProgramMember isGitHubStar
    }
  }
`;

export async function collectProfile(
  username: string,
  writable: WritableStream<InvestigationProgress>
): Promise<RawProfile | null> {
  "use step";

  // Emit progress
  const writer = writable.getWriter();
  await writer.write({
    phase: "profile",
    message: `Collecting profile data for ${username}...`,
  });
  writer.releaseLock();

  const result = await queryGitHubGraphQL(PROFILE_QUERY, { login: username });

  if (!result.data?.user) {
    return null;
  }

  const user = result.data.user;
  return {
    username,
    name: user.name,
    bio: user.bio,
    company: user.company,
    location: user.location,
    email: user.email,
    isHireable: user.isHireable,
    website: user.websiteUrl,
    twitter: user.twitterUsername,
    createdAt: user.createdAt,
    socialAccounts: user.socialAccounts.nodes,
    followersCount: user.followers.totalCount,
    followingCount: user.following.totalCount,
    organizations: user.organizations.nodes,
    pinnedItems: user.pinnedItems.nodes,
    publicReposCount: user.repositories.totalCount,
    contributionYears: user.contributionsCollection.contributionYears,
    badges: [
      user.isCampusExpert && "Campus Expert",
      user.isDeveloperProgramMember && "Developer Program Member",
      user.isGitHubStar && "GitHub Star",
    ].filter(Boolean),
  };
}
```

### 3.4 API Routes

```typescript
// src/app/api/agent/investigate/route.ts
import { start } from "workflow/api";
import { investigateGitHubUser } from "@/lib/agent/workflow";
import { getUserFromRequest } from "@/lib/github/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { username } = await request.json();
  if (!username || typeof username !== "string") {
    return Response.json({ error: "Username required" }, { status: 400 });
  }

  const run = await start(investigateGitHubUser, [username]);

  return Response.json({
    runId: run.runId,
    status: "started",
  });
}
```

```typescript
// src/app/api/agent/stream/route.ts
import { getRun } from "workflow/api";
import type { InvestigationProgress } from "@/lib/agent/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId required" }, { status: 400 });
  }

  const run = getRun(runId);
  const stream = run.getReadable<InvestigationProgress>();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
```

---

## 4. LLM Integration: Gemini

### 4.1 Why Gemini

| Factor | Decision |
|--------|----------|
| **Free tier** | 250 RPD, 10 RPM on Gemini 2.5 Flash — enough for ~25-50 investigations/day during development |
| **Cost at scale** | $0.30/M input, $2.50/M output — ~$0.01 per investigation |
| **Context window** | 1M tokens — can load entire repo analysis results in one prompt |
| **Function calling** | Native support with Zod schema validation |
| **Structured output** | JSON Schema support for type-safe profile generation |
| **SDK** | `@google/genai` v2.11+ — TypeScript, production-ready |

### 4.2 Model Selection

| Task | Model | Reasoning |
|------|-------|-----------|
| Repo categorization & depth decisions | `gemini-2.5-flash` | Fast, cheap, good enough for classification |
| Profile synthesis (Phase 5) | `gemini-2.5-flash` | Needs reasoning but Flash is sufficient |
| Fallback / complex cases | `gemini-2.5-pro` | If Flash output quality is insufficient (paid only) |

### 4.3 Alternative: Vercel AI Gateway

Instead of calling Gemini directly, consider using Vercel AI Gateway for:
- **Model fallback**: Auto-switch to another provider if Gemini is down
- **Observability**: Built-in logging of all LLM calls
- **Rate limit management**: Gateway-level throttling

However, AI Gateway adds a dependency and may not be necessary for v1. **Recommendation**: Start with direct Gemini SDK calls; migrate to AI Gateway if we need multi-provider support later.

### 4.4 Alternative LLM Considerations

If Gemini's free tier proves too restrictive or quality is insufficient:

| Provider | Pros | Cons |
|----------|------|------|
| **Claude (Anthropic)** | Best tool-calling reliability, excellent reasoning | No free API tier, higher cost |
| **OpenAI GPT-4o-mini** | Good quality, reasonable cost | No free tier |
| **Groq (Llama)** | Very fast inference, free tier | Lower quality for complex synthesis |

**Design for swappability**: Abstract LLM calls behind a simple interface so the provider can be changed without rewriting agent logic.

### 4.5 Gemini Client Wrapper

```typescript
// src/lib/agent/gemini.ts
import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export async function generateStructuredOutput<T>(opts: {
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  schema: Record<string, unknown>; // JSON Schema
}): Promise<T> {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: opts.model ?? "gemini-2.5-flash",
    systemInstruction: opts.systemPrompt,
    contents: opts.userPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: opts.schema,
    },
  });
  return JSON.parse(response.text!) as T;
}
```

---

## 5. GitHub API Client

### 5.1 Authentication

The agent needs a GitHub token with sufficient rate limits. Options:

| Approach | Rate Limit | Setup |
|----------|-----------|-------|
| **GitHub App installation token** | 5,000 req/hour (can increase) | Register a GitHub App, generate installation tokens |
| **Personal Access Token (PAT)** | 5,000 req/hour | Create a fine-grained PAT with public read-only access |
| **User's connected OAuth token** | 5,000 req/hour (shares user's limit) | Reuse token from HB-6 GitHub Connect |

**Recommendation**: Use a dedicated **Fine-Grained PAT** (or GitHub App) for the agent, separate from user OAuth tokens. This avoids consuming the user's rate limit and doesn't require the user to have connected their GitHub account.

Environment variable: `GITHUB_AGENT_TOKEN`

### 5.2 GraphQL Client

The codebase already has a GraphQL pattern in `signature.ts` (used for pinned/top-starred repos). The new `graphql.ts` module generalizes this into a shared client, reusing `USER_AGENT` and `REQUEST_TIMEOUT_MS` from `http.ts` and `isRateLimitError()` for consistency:

```typescript
// src/lib/github/graphql.ts
import { USER_AGENT, REQUEST_TIMEOUT_MS } from "./http";
import { GitHubApiError } from "./errors";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/**
 * Shared GraphQL client. Accepts an explicit token so it works for both:
 * - User's own OAuth token (existing features like signature.ts)
 * - Agent's dedicated PAT (investigation workflow)
 */
export async function queryGitHubGraphQL(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<{ data: any; errors?: any[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      if (response.status === 403 && remaining === "0") {
        const resetAt = response.headers.get("x-ratelimit-reset");
        const waitSeconds = resetAt
          ? Math.max(0, Number(resetAt) - Math.floor(Date.now() / 1000))
          : 60;
        // In workflow context, this becomes RetryableError
        throw new GitHubApiError(
          `Rate limit exceeded, resets in ${waitSeconds}s`,
          response.status
        );
      }
      throw new GitHubApiError(`GraphQL error`, response.status);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

This can also be adopted by the existing `signature.ts` to reduce its inline fetch logic.

### 5.3 Key GraphQL Queries

The agent uses 3-5 main GraphQL queries per investigation:

1. **Profile query** (Phase 1): User profile, orgs, pinned items, contribution years
2. **Repos query** (Phase 2): Top repositories with languages — paginated if needed
3. **Contributions query** (Phase 3): Per-year `contributionsCollection` — one query per year sampled
4. **Cross-repo query** (Phase 4): `repositoriesContributedTo`

Plus REST Search API calls for PR/issue discovery (Phase 4).

### 5.4 API Budget per Investigation

| Phase | GraphQL Points | REST Calls | Notes |
|-------|---------------|------------|-------|
| Profile | ~5 | 0 | Single query |
| Repos | ~10-30 | 0-5 | Depends on repo count; REST for `/languages` if needed |
| Contributions | ~10-30 | 0 | 1-3 year samples |
| Cross-repo | ~5-10 | 5-15 | Search API for PRs/issues (30/min limit) |
| README reads | 0 | 3-10 | Only for top repos |
| **Total** | **~30-75** | **~8-30** | Well within 5,000/hour |

---

## 6. Database Schema

### 6.1 New Tables

```sql
-- Migration: 20260713000000_github_investigations.sql

-- Investigation runs (links to Vercel Workflow runs)
CREATE TABLE public.github_investigations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_username TEXT NOT NULL,
  requested_by UUID REFERENCES auth.users(id),
  workflow_run_id TEXT,               -- Vercel Workflow run ID
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  profile_data JSONB,                 -- The full DeveloperProfile JSON
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for looking up by username (most common query)
CREATE INDEX idx_investigations_username ON public.github_investigations(target_username);

-- Index for looking up by requesting user
CREATE INDEX idx_investigations_requested_by ON public.github_investigations(requested_by);

-- Unique constraint: only one active investigation per username at a time
CREATE UNIQUE INDEX idx_investigations_active
  ON public.github_investigations(target_username)
  WHERE status IN ('pending', 'running');

-- Auto-update timestamp
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.github_investigations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.github_investigations ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all completed investigations
CREATE POLICY "Authenticated users can read completed investigations"
  ON public.github_investigations FOR SELECT
  TO authenticated
  USING (status = 'completed');

-- Users can read their own investigations (any status)
CREATE POLICY "Users can read own investigations"
  ON public.github_investigations FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- Service role can do everything (used by the agent workflow)
-- (No policy needed — service role bypasses RLS)
```

### 6.2 Why JSONB for Profile Data

The `DeveloperProfile` schema (defined in requirements doc Section 3) is stored as a JSONB column rather than normalized tables because:
- Schema is still evolving — adding new fields doesn't require migrations
- The profile is always read/written as a whole unit
- Supabase/PostgreSQL JSONB supports efficient querying (`profile_data->>'headline'`)
- Normalization would create 6+ tables for a single profile, adding complexity without benefit

---

## 7. Frontend Integration

### 7.1 Navigation: New Sidebar Item

Add "Investigate" to the sidebar nav in `src/components/app-shell/Sidebar.tsx`:

```typescript
// In the navItems array (alongside Profile, Explore, My Project):
{ href: "/investigate", icon: Search, labelKey: "nav.investigate" },
```

And in `messages/en.json` / `messages/zh.json`:
```json
{
  "nav": {
    "investigate": "Investigate"
  },
  "pages": {
    "investigateSubtitle": "Research a GitHub developer's skills and career history."
  }
}
```

### 7.2 Investigation Trigger Page

```
/(app)/investigate          →  src/app/[locale]/(app)/investigate/page.tsx
```

Follows existing page patterns (like `/explore`):
- Text input for GitHub username
- "Investigate" button
- List of recent investigations (from `github_investigations` table)
- Uses React Query for data fetching (like `LanguageDistribution` and `SignatureRepos` components)

### 7.3 Investigation Result Page

```
/(app)/investigate/[runId]  →  src/app/[locale]/(app)/investigate/[runId]/page.tsx
```

Real-time view of an investigation:
- While running: streaming progress updates from the workflow
- When complete: rendered `DeveloperProfile` with charts and links
- If failed: error message with retry button
- Admin impersonation via `?viewAs=` works automatically (inherited from `(app)` layout)

### 7.3 Streaming Integration

```typescript
// Client-side: subscribe to workflow stream
"use client";

import { useEffect, useState } from "react";

export function useInvestigationStream(runId: string | null) {
  const [progress, setProgress] = useState<InvestigationProgress[]>([]);
  const [result, setResult] = useState<DeveloperProfile | null>(null);

  useEffect(() => {
    if (!runId) return;

    const eventSource = new EventSource(
      `/api/agent/stream?runId=${runId}`
    );

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setProgress((prev) => [...prev, data]);
      } else if (data.type === "result") {
        setResult(data.profile);
        eventSource.close();
      }
    };

    return () => eventSource.close();
  }, [runId]);

  return { progress, result };
}
```

Note: The exact streaming integration pattern depends on Vercel Workflow's `getReadable()` API. The above is illustrative — the actual implementation should follow the Workflow SDK docs for the client consumption pattern (may use `ReadableStream` piping rather than SSE, or the Workflow SDK may provide a client-side helper).

---

## 8. Environment Variables

### 8.1 New Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `GEMINI_API_KEY` | Google Gemini API key | Server-only |
| `GITHUB_AGENT_TOKEN` | GitHub PAT for agent API calls | Server-only |

Both should be added to Vercel project settings for Preview and Production environments.

### 8.2 Existing Variables (No Changes)

The agent reuses the existing Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`) for database writes.

---

## 9. Dependencies

### 9.1 New npm Packages

```json
{
  "dependencies": {
    "workflow": "latest",
    "@workflow/ai": "latest",
    "@google/genai": "^2.11.0"
  },
  "devDependencies": {
    "@workflow/vitest": "latest"
  }
}
```

### 9.2 Next.js Configuration

Vercel Workflow requires a Next.js plugin:

```typescript
// next.config.ts (updated)
import createNextIntlPlugin from "next-intl/plugin";
import { withWorkflow } from "workflow/next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig = {
  // existing config...
};

export default withWorkflow(withNextIntl(nextConfig));
```

---

## 10. Deployment

### 10.1 Vercel Configuration

No changes to `vercel.json` needed. Workflow functions deploy as standard Vercel Functions.

Recommended function config for agent steps (if needed):

```json
{
  "functions": {
    "src/lib/agent/steps/*.ts": {
      "maxDuration": 60
    }
  }
}
```

Individual steps should complete within 60 seconds. The overall workflow has no time limit (Vercel Workflow handles the orchestration across function invocations).

### 10.2 Costs (Estimated for Free Tier)

| Resource | Free Allowance | Usage per Investigation | Investigations/Month |
|----------|---------------|----------------------|---------------------|
| Workflow Events | 50,000/month | ~50 events (5 steps x ~10 events each) | ~1,000 |
| Workflow Data Written | 1 GB/month | ~50 KB | ~20,000 |
| Function Invocations | 100,000/month | ~10-20 invocations | ~5,000-10,000 |
| Function Execution | 100 hours/month | ~1-3 minutes | ~2,000-6,000 |
| Gemini API (free) | 250 RPD | ~5-10 requests | ~25-50/day |
| GitHub API | 5,000/hour (with token) | ~50-100 calls | Unlimited practically |

**Conclusion**: On the Vercel Hobby plan + Gemini free tier, we can comfortably run **~25 investigations per day** (bottleneck: Gemini free tier RPD). Going beyond requires Gemini paid tier ($0.01/investigation) or a model change.

### 10.3 Scaling Path

| Phase | LLM | Vercel Plan | Capacity |
|-------|-----|-------------|----------|
| Dev/Prototype | Gemini 2.5 Flash (free) | Hobby | ~25/day |
| Early Users | Gemini 2.5 Flash (paid Tier 1) | Hobby or Pro | ~500/day |
| Growth | Gemini 2.5 Flash (paid) via AI Gateway | Pro | ~5,000/day |
| Scale | Multi-model (Flash + Pro) via AI Gateway | Pro | ~50,000/day |

---

## 11. Testing Strategy

### 11.1 Unit Tests

Test step functions in isolation with mocked GitHub/Gemini responses:

```typescript
// src/lib/agent/steps/__tests__/collect-profile.test.ts
import { describe, it, expect, vi } from "vitest";
import { collectProfile } from "../collect-profile";

// Mock GitHub API
vi.mock("@/lib/github/graphql", () => ({
  queryGitHubGraphQL: vi.fn().mockResolvedValue({
    data: {
      user: {
        name: "Test User",
        bio: "A developer",
        // ... mock data
      },
    },
  }),
}));

describe("collectProfile", () => {
  it("should return null for nonexistent user", async () => {
    // Override mock for this test
    const { queryGitHubGraphQL } = await import("@/lib/github/graphql");
    (queryGitHubGraphQL as any).mockResolvedValueOnce({ data: { user: null } });

    const mockWritable = new WritableStream({ write() {} });
    const result = await collectProfile("nonexistent", mockWritable);
    expect(result).toBeNull();
  });
});
```

### 11.2 Integration Tests

Use `@workflow/vitest` to test the full workflow pipeline:

```typescript
// src/lib/agent/__tests__/workflow.integration.test.ts
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import { investigateGitHubUser } from "../workflow";

describe("investigateGitHubUser workflow", () => {
  it("should complete investigation for a real user", async () => {
    const run = await start(investigateGitHubUser, ["octocat"]);
    const result = await run.returnValue;

    expect(result).toHaveProperty("identity");
    expect(result.identity.github_username).toBe("octocat");
    expect(result).toHaveProperty("technical_skills");
    expect(result).toHaveProperty("ai_summary");
  }, 120_000); // 2 minute timeout
});
```

### 11.3 Test Fixtures

Create snapshot fixtures from real GitHub API responses to avoid hitting APIs in CI:

```
src/lib/agent/__fixtures__/
├── octocat-profile.json
├── octocat-repos.json
├── octocat-contributions.json
└── octocat-search-prs.json
```

---

## 12. Implementation Plan

### Phase 0: Setup (1-2 days)

1. Install dependencies: `workflow`, `@workflow/ai`, `@google/genai`
2. Configure `next.config.ts` with `withWorkflow`
3. Set up `GEMINI_API_KEY` and `GITHUB_AGENT_TOKEN` in Vercel env
4. Create the `src/lib/agent/` directory structure
5. Create the `src/lib/github/graphql.ts` client
6. Verify Workflow works with a minimal "hello world" workflow
7. Deploy to Vercel Preview and confirm workflow runs

### Phase 1: Data Collection Steps (2-3 days)

1. Extract shared `graphql.ts` client from existing `signature.ts` patterns
2. Refactor `languages.ts` and `signature.ts` to accept token parameter (for reuse by agent)
3. Implement `collect-profile` step with GraphQL query
4. Implement `analyze-repos` step (reusing refactored languages/signature logic)
5. Implement `analyze-contributions` step (multi-year contribution scanning)
6. Implement `analyze-cross-repo` step (Search API for PRs/issues)
7. Test each step independently with unit tests
8. Wire steps into the workflow definition

### Phase 2: AI Synthesis (2-3 days)

1. Design prompt templates for profile synthesis
2. Implement `synthesize` step with Gemini structured output
3. Define Zod schemas for the DeveloperProfile output
4. Test synthesis quality with 5-10 real GitHub users
5. Iterate on prompts based on output quality

### Phase 3: API & Database (1-2 days)

1. Create the `github_investigations` migration
2. Implement API routes: `POST /api/agent/investigate`, `GET /api/agent/stream`
3. Implement `save-profile` step
4. Test end-to-end: API call -> workflow -> database

### Phase 4: Frontend (2-3 days)

1. Add "Investigate" sidebar item in `Sidebar.tsx` + i18n keys
2. Build investigation trigger page (`/(app)/investigate`)
3. Build streaming progress component
4. Build developer profile display component (can reuse `LanguageDistribution`/`SignatureRepos` patterns)
5. Wire up to API routes with React Query (existing pattern)
6. Test full user flow

### Phase 5: Polish & Deploy (1-2 days)

1. Error handling and edge cases
2. Rate limit handling (GitHub + Gemini)
3. Integration tests
4. Deploy to production
5. Monitor first real investigations

**Total estimated effort: 9-13 days**

---

## 13. Open Questions

1. **Rate limit strategy**: Should we queue investigations and process them sequentially to avoid rate limits, or allow parallel investigations? For v1, sequential is simpler.

2. **Profile freshness**: How often should we re-investigate a user? On-demand only, or on a schedule? Recommendation: on-demand for v1.

3. **GitHub App vs. PAT**: A GitHub App provides better rate limits and can be installed on orgs. Worth the setup complexity? Recommendation: start with PAT, migrate to App if rate limits become an issue.

4. **Gemini vs. Vercel AI Gateway**: Direct Gemini calls are simpler but lock us to one provider. AI Gateway adds abstraction but more setup. Recommendation: direct calls for v1, Gateway when we need multi-provider.

5. **DurableAgent vs. manual steps**: Vercel Workflow's `DurableAgent` could run the entire investigation as an LLM-driven loop with tools. This is more flexible but less predictable and harder to debug. Recommendation: use explicit steps for v1, explore DurableAgent for v2 if the agent needs more dynamic decision-making.

6. **Webhook for auto-trigger**: Should connecting GitHub (HB-6) automatically trigger an investigation? This ties two features together. Recommendation: separate for v1, add as opt-in for v2.
