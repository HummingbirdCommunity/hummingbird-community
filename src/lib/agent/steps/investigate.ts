// Agent steps — each step is a durable, retryable unit of work.
// The workflow orchestrates the loop; these steps handle individual turns.

import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { getWritable } from 'workflow';

import { REQUEST_TIMEOUT_MS, USER_AGENT } from '@/lib/github/http';
import { aggregateSignatureRepos } from '@/lib/github/signature';
import { getUserGitHubToken } from '@/lib/github/token';
import { supabase } from '@/lib/supabase/server';

import type { EvidenceSnapshot } from '../evidence';
import type { DeveloperSummary, InvestigationProgress, ProfileSource, ProfileVisibility, Provenance } from '../types';
import { fetchContributions } from '../contributions';
import { llmChatWithProvider } from '../llm';
import { SUMMARY_JSON_SCHEMA, SYSTEM_PROMPT } from '../prompts';

export { SYSTEM_PROMPT };

// -- Tool definitions (OpenAI function calling format) --

const usernameParam = {
	type: 'object' as const,
	properties: { username: { type: 'string', description: 'GitHub username' } },
	required: ['username'],
};

export const TOOLS: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'get_github_profile',
			description:
				"Get a GitHub user's public profile: name, bio, company, location, follower count, public repo count, and account creation date.",
			parameters: usernameParam,
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_top_repos',
			description:
				"Get a GitHub user's top public repositories sorted by stars (up to 10). Returns repo name, description, primary language, star count, fork count, and topics.",
			parameters: usernameParam,
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_signature_repos',
			description:
				"Get a user's signature repositories — the repos they pinned plus their top-starred owned repos — with stars, forks, primary language, and whether each is a fork. Good for what the developer wants to be known for.",
			parameters: usernameParam,
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_contributions',
			description:
				"Get a user's contribution activity: total commits/PRs/issues/reviews, active years, and — most importantly — languages ranked by the user's OWN commit participation (not repo size), plus the repos they committed to most. Use this to judge real language proficiency.",
			parameters: usernameParam,
		},
	},
	{
		type: 'function',
		function: {
			name: 'search_cross_repo_prs',
			description:
				'Find pull requests the user opened in repositories they do NOT own (external / open-source contributions). Returns repo, PR title, URL, and state.',
			parameters: usernameParam,
		},
	},
];

// -- Steps --

/** Emit a progress message. Separate step so it flushes to the stream
 *  before the next (potentially long-running) step starts. */
export async function emitProgress(
	phase: InvestigationProgress['phase'],
	key: string,
	params?: Record<string, string | number>,
	status?: InvestigationProgress['status']
) {
	'use step';
	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase, key, params, status });
	} finally {
		writer.releaseLock();
	}
}

/** Call a provider for the gathering loop (tools enabled). Returns the choice.
 *  Throws ProviderUnavailableError on rate limit so the workflow tries the next. */
export async function callProvider(providerName: string, messages: ChatCompletionMessageParam[]) {
	'use step';

	const { response, provider, model } = await llmChatWithProvider(providerName, {
		messages,
		tools: TOOLS,
	});
	const choice = response.choices[0];
	if (!choice) throw new Error('No response from LLM');

	return { choice, provider, model };
}

/** Call a provider for synthesis: no tools, JSON-schema response format. Returns
 *  the raw JSON string content (the workflow parses + validates it). */
export async function callProviderStructured(providerName: string, messages: ChatCompletionMessageParam[]) {
	'use step';

	const { response } = await llmChatWithProvider(providerName, {
		messages,
		responseFormat: {
			type: 'json_schema',
			json_schema: { name: 'developer_summary', strict: true, schema: SUMMARY_JSON_SCHEMA },
		},
	});
	const content = response.choices[0]?.message?.content;
	if (!content) throw new Error('No content from LLM synthesis');
	return { content };
}

/** Execute a single tool call against the GitHub API.
 *  `requesterId` is the user who started the investigation; their connected
 *  OAuth token authenticates the call (5,000 req/hr). We resolve and decrypt it
 *  here — inside the step — so the plaintext token never lands in durable
 *  workflow state. Falls back to anonymous (60 req/hr) when they haven't
 *  connected GitHub; GraphQL-backed tools require a token and return an error
 *  in that case. */
export async function executeToolCall(name: string, args: Record<string, string>, requesterId: string) {
	'use step';

	const token = await getUserGitHubToken(requesterId);
	if (!token) {
		console.warn('[agent] no GitHub token for requester; using anonymous GitHub API (60 req/hr)');
	}
	const headers: Record<string, string> = {
		'User-Agent': USER_AGENT,
		Accept: 'application/vnd.github+json',
		...(token ? { Authorization: `Bearer ${token}` } : {}),
	};
	const username = args.username;

	switch (name) {
		case 'get_github_profile': {
			const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
				headers,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
			if (res.status === 404) return JSON.stringify({ error: 'User not found' });
			if (!res.ok) return JSON.stringify({ error: `GitHub API error: ${res.status}` });
			const data = await res.json();
			return JSON.stringify({
				login: data.login,
				name: data.name,
				bio: data.bio,
				company: data.company,
				location: data.location,
				blog: data.blog,
				public_repos: data.public_repos,
				followers: data.followers,
				following: data.following,
				created_at: data.created_at,
				avatar_url: data.avatar_url,
				html_url: data.html_url,
			});
		}
		case 'get_top_repos': {
			const res = await fetch(
				`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10&type=owner`,
				{ headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
			);
			if (!res.ok) return JSON.stringify({ error: `GitHub API error: ${res.status}` });
			const repos = await res.json();
			return JSON.stringify(
				(repos as Array<Record<string, unknown>>).map((r) => ({
					name: r.name,
					description: r.description,
					language: r.language,
					stargazers_count: r.stargazers_count,
					forks_count: r.forks_count,
					topics: r.topics,
				}))
			);
		}
		case 'get_signature_repos': {
			if (!token)
				return JSON.stringify({
					error: 'Requires the requester to have connected GitHub (GraphQL needs a token).',
				});
			try {
				const { repos } = await aggregateSignatureRepos(token, username);
				return JSON.stringify(repos);
			} catch (err) {
				return JSON.stringify({ error: err instanceof Error ? err.message : 'signature lookup failed' });
			}
		}
		case 'get_contributions': {
			if (!token)
				return JSON.stringify({
					error: 'Requires the requester to have connected GitHub (GraphQL needs a token).',
				});
			try {
				const summary = await fetchContributions(token, username);
				return JSON.stringify(summary);
			} catch (err) {
				return JSON.stringify({ error: err instanceof Error ? err.message : 'contributions lookup failed' });
			}
		}
		case 'search_cross_repo_prs': {
			const q = `author:${username} type:pr`;
			const res = await fetch(
				`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=20&sort=interactions&order=desc`,
				{ headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
			);
			if (!res.ok) return JSON.stringify({ error: `GitHub API error: ${res.status}` });
			const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
			const external = (data.items ?? [])
				.map((item) => {
					// repository_url is https://api.github.com/repos/{owner}/{repo}
					const repoPath = String(item.repository_url ?? '').replace('https://api.github.com/repos/', '');
					const owner = repoPath.split('/')[0] ?? '';
					return {
						repo: repoPath,
						owner,
						title: item.title as string,
						url: item.html_url as string,
						state: item.state as string,
					};
				})
				// Only PRs to repos the user does NOT own.
				.filter((pr) => pr.owner.toLowerCase() !== username.toLowerCase())
				.slice(0, 10)
				.map(({ repo, title, url, state }) => ({ repo, title, url, state }));
			return JSON.stringify(external);
		}
		default:
			return JSON.stringify({ error: `Unknown tool: ${name}` });
	}
}

/** Upsert the subject's canonical developer profile from a completed run.
 *  Keyed by (github_login, source): an observed regeneration only ever touches
 *  the observed row, so it can never overwrite an authored profile. Timestamps
 *  are stamped here (in the step) rather than by the workflow orchestrator,
 *  which replays and would drift on `Date`. `freshnessDays` = null means no
 *  expiry (authored); `setPurge` marks a non-member observed profile for the
 *  scheduled hard delete (HB-28). Returns the profile id so the run can point
 *  at it. Throws on failure — the caller records the run as failed rather than
 *  leaving a half-written profile. */
export async function upsertDeveloperProfile(input: {
	githubLogin: string;
	source: ProfileSource;
	visibility?: ProfileVisibility;
	subjectUserId?: string | null;
	summary: DeveloperSummary;
	evidenceSnapshot: EvidenceSnapshot;
	provenance: Provenance;
	freshnessDays: number | null;
	setPurge: boolean;
}): Promise<string> {
	'use step';

	const now = new Date();
	const expiresAt =
		input.freshnessDays != null
			? new Date(now.getTime() + input.freshnessDays * 24 * 60 * 60 * 1000).toISOString()
			: null;

	const { data, error } = await supabase
		.from('developer_profiles')
		.upsert(
			{
				github_login: input.githubLogin,
				source: input.source,
				visibility: input.visibility ?? 'private',
				subject_user_id: input.subjectUserId ?? null,
				summary: input.summary,
				evidence_snapshot: input.evidenceSnapshot,
				provenance: input.provenance,
				generated_at: now.toISOString(),
				fresh_until: expiresAt,
				purge_after: input.setPurge ? expiresAt : null,
			},
			{ onConflict: 'github_login,source' }
		)
		.select('id')
		.single();

	if (error || !data) {
		throw new Error(`Failed to upsert developer profile: ${error?.message ?? 'no row returned'}`);
	}
	return data.id as string;
}

/** Record the terminal state of an investigation run, keyed by the run row id
 *  (stable, known before the workflow starts). A write failure is logged but not
 *  thrown — this row is an audit trail; the workflow's own return value is still
 *  the source of truth for the immediate response. */
export async function saveRunResult(
	runId: string,
	patch: { status: 'completed'; profileId: string } | { status: 'failed'; errorMessage: string }
) {
	'use step';

	const { error } = await supabase
		.from('investigation_runs')
		.update({
			status: patch.status,
			completed_at: new Date().toISOString(),
			...(patch.status === 'completed' ? { profile_id: patch.profileId } : { error_message: patch.errorMessage }),
		})
		.eq('id', runId);

	if (error) {
		console.error('[agent] failed to save run result:', error);
	}
}
