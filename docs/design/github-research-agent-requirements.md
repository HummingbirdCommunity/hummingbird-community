# GitHub Research Agent - Requirements Document

> Status: Draft v2 | Date: 2026-07-12 | Updated to reflect HB-15/16/17 changes

## 1. Overview

### 1.1 Purpose

Build an AI agent that, given a target GitHub username, autonomously explores the user's public GitHub activity and produces a structured "developer profile" — a verifiable summary of their technical skills, experience depth, open-source contributions, and career trajectory.

### 1.2 Strategic Context

Hummingbird is a **skills community** where developers showcase real abilities, discover each other, and collaborate. The GitHub Research Agent is the **first data-driven tool** in this community:

- **Community value (now)**: Help members build verifiable skill profiles and discover collaborators with complementary expertise.
- **Platform value (growth)**: As profiles accumulate, the community becomes a rich, structured dataset of developer capabilities — enabling search, matching, and serendipitous connections.
- **Downstream value (future)**: At sufficient scale, recruitment use cases emerge naturally — companies discover talent through the community, rather than candidates being "investigated." This is a natural outcome, not the starting goal.

### 1.3 Scope

Phase 1 (this document): Single-user investigation from public GitHub data only. No private repo access, no cross-platform aggregation (LinkedIn, StackOverflow, etc.).

---

## 2. Agent Workflow

### 2.1 Trigger

The agent is triggered with a single input: a GitHub username (e.g., `torvalds`).

Trigger sources (in priority order):
1. **Manual**: User enters a username in the app (explore others or generate own profile).
2. **On GitHub Connect**: When a Hummingbird user connects their GitHub account (existing HB-6 flow on `/profile`), automatically queue an investigation.
3. **Batch**: Bulk import a list of usernames (future phase).

### 2.2 Investigation Pipeline

The agent follows a multi-phase, iterative pipeline. Each phase feeds the next.

```
Phase 1: Profile Collection
  |
  v
Phase 2: Repository Analysis
  |
  v
Phase 3: Contribution Deep-Dive
  |
  v
Phase 4: Cross-Repo Activity (PRs, Issues, Reviews)
  |
  v
Phase 5: AI Synthesis & Scoring
  |
  v
Output: Structured Developer Profile
```

#### Phase 1: Profile Collection

Collect basic identity and metadata:
- Name, bio, company, location, email, website, social accounts
- Account creation date (career tenure)
- Follower/following counts
- Organization memberships (public)
- Pinned repositories (user-curated highlights)
- `isHireable` flag
- GitHub program badges (Campus Expert, Developer Program Member, GitHub Star, etc.)

**Data source**: Single GraphQL query on `user()` object.

#### Phase 2: Repository Analysis

Analyze the user's owned repositories:
- List all public repos (up to 100 most-starred, then paginate if needed)
- For each repo: stars, forks, primary language, all languages (with byte counts), topics, description, creation date, last push date
- Aggregate language distribution across all repos (weighted by bytes)
- Identify "signature projects" — repos with significant stars, forks, or community engagement
- Detect repo categories: library, app, tool, documentation, learning/tutorial, fork-only

**Data source**: GraphQL `repositories` with nested `languages` edges.

**Reuse opportunity**: The app already has `lib/github/languages.ts` (aggregates language bytes across repos, HB-7) and `lib/github/signature.ts` (fetches pinned + top-starred repos via GraphQL, HB-10). The agent should reuse this logic rather than reimplementing it, adapting it to accept an arbitrary username + token instead of only the authenticated user's token.

**AI judgment call**: The agent decides which repos are worth deeper analysis (README reading, dependency inspection) based on star count, recency, and whether it's a fork. This prevents wasting API calls on trivial/abandoned repos.

#### Phase 3: Contribution Deep-Dive

Analyze contribution patterns over time:
- Yearly contribution counts (commits, PRs, issues, reviews) via `contributionsCollection`
- Contribution calendar heatmap data (activity consistency)
- Contributions by repository (which repos got the most work)
- First contribution milestones (first PR, first issue, first repo created)
- Most popular contributions (highest-engagement PR and issue)
- Private contribution count (if user opted in)

**Data source**: GraphQL `contributionsCollection` — must query per-year using `contributionYears` array.

**AI analysis**:
- Activity trend: increasing, stable, declining, sporadic
- Work patterns: weekday-heavy (professional), weekend-heavy (hobbyist), consistent (dedicated OSS)
- Breadth vs. depth: many repos with few contributions vs. deep focus on few projects

#### Phase 4: Cross-Repo Activity

Discover contributions to repositories the user doesn't own:
- Repos contributed to (via `repositoriesContributedTo`)
- PRs authored across GitHub (via Search API: `author:{username} type:pr`)
- Issues filed across GitHub (via Search API: `author:{username} type:issue`)
- PR reviews given (via Search API: `reviewed-by:{username} type:pr`)

For notable contributions (to popular repos, merged PRs to well-known projects):
- Read PR titles and descriptions for context
- Identify the ecosystem/project the user is contributing to

**Data source**: GraphQL + REST Search API (30 req/min limit — agent must pace itself).

**AI judgment call**: The agent prioritizes exploring contributions to well-known/high-star repos first, as these carry more signal for skill assessment.

#### Phase 5: AI Synthesis & Scoring

The LLM synthesizes all collected data into the structured output (see Section 3).

Key synthesis tasks:
- Infer skill levels from contribution depth, not just language presence
- Distinguish between "used Python in a script" vs. "maintained a Python framework"
- Identify domain expertise from project topics and descriptions (ML, web, systems, DevOps, etc.)
- Assess collaboration signals: PR reviews given, issue discussions, multi-author repos
- Detect career progression: from student projects to professional/OSS leadership

---

## 3. Output: Developer Profile Schema

> ⚠️ **As-built note (2026-07-14):** The schema below is the original, fuller
> design target. The shipped output (through Phase 2 / HB-21) is a leaner,
> evidence-backed `DeveloperSummary` — see
> [technical doc §0.7](github-research-agent-technical.md#07-output-schema-as-built)
> and `src/lib/agent/types.ts`. The dimensions below remain the direction of
> travel for future phases.

The agent produces a structured JSON document with the following dimensions.

### 3.1 Identity

```json
{
  "github_username": "torvalds",
  "display_name": "Linus Torvalds",
  "avatar_url": "https://...",
  "bio": "...",
  "location": "Portland, OR",
  "company": "Linux Foundation",
  "website": "https://...",
  "social_accounts": [
    { "provider": "twitter", "url": "https://..." }
  ],
  "github_member_since": "2011-09-03",
  "is_hireable": false,
  "badges": ["GitHub Star", "Developer Program Member"],
  "organizations": ["linux", "git"],
  "followers_count": 200000,
  "public_repos_count": 7
}
```

### 3.2 Technical Skills

```json
{
  "primary_languages": [
    {
      "language": "C",
      "proficiency": "expert",
      "evidence": "Primary language in 5 repos, 2M+ lines, 15+ years of commits",
      "percentage_of_code": 78.5
    }
  ],
  "secondary_languages": [
    {
      "language": "Shell",
      "proficiency": "proficient",
      "evidence": "Build scripts and tooling across multiple projects",
      "percentage_of_code": 12.3
    }
  ],
  "frameworks_and_tools": [
    {
      "name": "Make/CMake",
      "category": "build-system",
      "evidence": "Complex build systems in kernel and git repos"
    }
  ],
  "domains": [
    {
      "domain": "Operating Systems / Kernel Development",
      "depth": "world-class",
      "evidence": "Creator and maintainer of Linux kernel"
    },
    {
      "domain": "Version Control Systems",
      "depth": "expert",
      "evidence": "Creator of Git"
    }
  ]
}
```

Proficiency levels (for languages): `beginner` | `familiar` | `proficient` | `expert`

Depth levels (for domains): `exposure` | `working-knowledge` | `deep` | `expert` | `world-class`

### 3.3 Experience & Career

```json
{
  "years_active_on_github": 15,
  "career_stage": "senior-leader",
  "activity_trend": "stable",
  "work_pattern": "consistent-professional",
  "total_contributions": {
    "commits": 35000,
    "pull_requests": 200,
    "issues": 50,
    "reviews": 1500,
    "repos_created": 7
  },
  "contribution_consistency": {
    "active_years": [2011, 2012, "...", 2026],
    "avg_weekly_contributions": 45,
    "longest_streak_days": 365
  }
}
```

Career stages: `student` | `early-career` | `mid-career` | `senior` | `senior-leader` | `emeritus`

Activity trends: `ramping-up` | `stable` | `declining` | `sporadic` | `burst`

### 3.4 Open Source Impact

```json
{
  "signature_projects": [
    {
      "repo": "torvalds/linux",
      "role": "creator-maintainer",
      "description": "Linux kernel",
      "stars": 180000,
      "forks": 55000,
      "languages": ["C", "Assembly"],
      "impact_summary": "Most widely used OS kernel in the world"
    }
  ],
  "notable_contributions": [
    {
      "repo": "git/git",
      "type": "creator",
      "description": "Created the Git version control system",
      "prs_merged": 15,
      "impact": "Ubiquitous tool used by virtually all software developers"
    }
  ],
  "community_engagement": {
    "repos_contributed_to_count": 3,
    "pr_reviews_given": 1500,
    "issues_filed": 50,
    "collaboration_style": "maintainer-reviewer"
  }
}
```

Roles: `creator-maintainer` | `core-contributor` | `regular-contributor` | `occasional-contributor` | `one-time-contributor`

Collaboration styles: `solo-builder` | `team-player` | `maintainer-reviewer` | `community-leader` | `contributor`

### 3.5 AI Summary

```json
{
  "headline": "Creator of Linux and Git. World-class systems programmer with 15+ years of kernel development.",
  "strengths": [
    "Deep expertise in low-level systems programming (C, kernel development)",
    "Proven ability to create and maintain world-scale open source projects",
    "Extensive code review experience across massive codebases"
  ],
  "notable_for": [
    "Created and maintains the Linux kernel",
    "Created Git, now the universal version control system"
  ],
  "collaboration_opportunities": [
    "Systems programming projects",
    "OS/kernel development",
    "Technical leadership and mentoring"
  ],
  "data_quality_notes": [
    "Profile is heavily weighted toward kernel work; GitHub may not reflect full activity",
    "Low PR count is expected — kernel development uses email-based patch workflow"
  ]
}
```

### 3.6 Metadata

```json
{
  "profile_version": "1.0",
  "generated_at": "2026-07-12T10:30:00Z",
  "agent_model": "gemini-2.5-flash",
  "data_sources": {
    "graphql_queries": 5,
    "rest_api_calls": 12,
    "repos_analyzed": 7,
    "contribution_years_scanned": [2011, "...", 2026]
  },
  "confidence": "high",
  "limitations": [
    "Only public GitHub data analyzed",
    "Private repos and contributions not visible",
    "Non-GitHub work (email patches, other platforms) not captured"
  ]
}
```

---

## 4. Agent Decision Rules

The agent is not a rigid script — it uses AI judgment to decide what to explore deeper. Key rules:

### 4.1 Exploration Budget

- **Max GitHub API calls per investigation**: ~100 (to stay well within rate limits)
- **Max LLM calls per investigation**: ~10 (to stay within Gemini free tier)
- **Target completion time**: < 2 minutes for typical users, < 5 minutes for prolific contributors

### 4.2 Depth Heuristics

| Signal | Action |
|--------|--------|
| User has < 5 public repos | Analyze all repos in detail (read READMEs) |
| User has 5-30 repos | Analyze top 10 by stars, sample 5 others |
| User has 30+ repos | Analyze top 15 by stars, categorize the rest by language only |
| Repo has > 100 stars | Always read README and check topics |
| Repo is a fork with 0 commits ahead | Skip entirely |
| User contributed to repo with > 1000 stars | Investigate the PR/issue details |
| Contribution years span > 5 years | Scan 3 representative years (earliest, middle, latest) |

### 4.3 Error Handling

- **GitHub API rate limit hit**: Pause workflow (Vercel Workflow `sleep`), retry after reset
- **Gemini API rate limit hit**: Use `RetryableError` with backoff
- **User not found / private profile**: Return minimal profile with error note
- **Partial data**: Always produce output even if some phases fail; note limitations

### 4.4 Data Quality Signals

The agent should flag when its analysis may be unreliable:
- Account is very new (< 1 year): "Limited history available"
- All repos are forks: "Mostly forked repos — may indicate learning phase or mirror usage"
- Very few contributions but many stars on one repo: "Viral project, may not reflect sustained activity"
- Bot-like contribution patterns: "Automated contribution patterns detected"

---

## 5. User Experience

### 5.1 Triggering an Investigation

In the Hummingbird app shell (via the "Investigate" sidebar item at `/(app)/investigate`):
1. User enters a GitHub username in a search field
2. System validates the username exists (quick GitHub API check)
3. Investigation starts — user sees a progress indicator
4. Results stream in as the agent progresses (via Vercel Workflow streaming)

### 5.2 Progress Display

While the agent works, the UI shows:
- Current phase (e.g., "Analyzing repositories...")
- Key facts discovered so far (streamed via namespaced WritableStreams)
- Estimated completion (based on repo count)

### 5.3 Result Display

The developer profile is rendered as a structured card/page:
- Header: avatar, name, headline, badges
- Skills radar or bar chart (languages, domains)
- Timeline: career activity over years
- Signature projects: cards with star/fork counts
- Notable contributions: links to actual PRs/issues
- AI summary: strengths, collaboration opportunities

### 5.4 Caching & Refresh

- Profiles are cached in the database after generation
- Profiles can be manually refreshed (re-run the agent)
- Auto-refresh policy (future): re-investigate profiles older than 30 days if the user is active on the platform

---

## 6. Privacy & Ethics

### 6.1 Data Scope

- **Only public data**: The agent never accesses private repos, private contributions, or data requiring elevated GitHub scopes
- **No scraping**: All data comes through official GitHub APIs (REST + GraphQL)
- **Attribution**: Every claim in the profile links back to the source (repo URL, PR URL, etc.)

### 6.2 User Control

- Users who connect their GitHub to Hummingbird can see and edit their own generated profile
- Users can request removal of their profile from the platform
- Investigation results are stored only within Hummingbird's database, not shared externally

### 6.3 Responsible AI

- The agent provides skill analysis for community discovery, not hiring recommendations
- Proficiency/depth assessments are clearly labeled as AI-inferred, not verified
- The agent explicitly notes limitations and data quality concerns

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Investigation completion rate | > 95% |
| Average investigation time | < 3 minutes |
| Profile accuracy (spot-check) | > 90% of factual claims verifiable |
| GitHub API calls per investigation | < 100 |
| Cost per investigation (LLM) | < $0.02 on Gemini Flash |
| User satisfaction with profile quality | TBD (qualitative feedback) |

---

## 8. Future Phases (Out of Scope for v1)

- **Cross-platform enrichment**: StackOverflow, personal blogs, other skill signals
- **Commit-level analysis**: Analyze actual code diffs for code quality signals
- **Community discovery**: "Find members with similar skills" or "complementary skills for my project"
- **Team/org analysis**: Profile an entire GitHub org's team composition
- **Automated refresh**: Periodic re-investigation on a schedule
- **README/documentation quality scoring**: Assess communication skills through writing
- **Dependency graph analysis**: What ecosystems does this developer operate in?
- **Recruitment features (downstream)**: When community data reaches sufficient scale, enable opt-in talent discovery for companies
