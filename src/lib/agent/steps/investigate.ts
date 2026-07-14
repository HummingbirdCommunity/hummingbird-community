// Agent steps — each step is a durable, retryable unit of work.
// The workflow orchestrates the loop; these steps handle individual turns.

import { getWritable } from 'workflow';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

import type { InvestigationProgress } from '../types';
import { llmChatWithProvider } from '../llm';
import { USER_AGENT, REQUEST_TIMEOUT_MS } from '@/lib/github/http';

export interface DeveloperSummary {
	headline: string;
	strengths: string[];
	primary_languages: string[];
	notable_repos: string[];
	career_stage: string;
}

// -- Tool definitions (OpenAI function calling format) --

export const TOOLS: ChatCompletionTool[] = [
	{
		type: 'function',
		function: {
			name: 'get_github_profile',
			description:
				"Get a GitHub user's public profile including name, bio, company, location, follower count, public repo count, and account creation date.",
			parameters: {
				type: 'object',
				properties: {
					username: { type: 'string', description: 'GitHub username' },
				},
				required: ['username'],
			},
		},
	},
	{
		type: 'function',
		function: {
			name: 'get_top_repos',
			description:
				"Get a GitHub user's top public repositories sorted by stars (up to 10). Returns repo name, description, primary language, star count, fork count, and topics.",
			parameters: {
				type: 'object',
				properties: {
					username: { type: 'string', description: 'GitHub username' },
				},
				required: ['username'],
			},
		},
	},
];

export const SYSTEM_PROMPT = `You are a developer research agent. Given a GitHub username, use the available tools to investigate the developer, then produce a JSON summary.

Instructions:
1. First call get_github_profile to get the user's profile
2. Then call get_top_repos to see their repositories
3. Based on the data, produce your final response as a JSON object with this structure:
{
  "headline": "A one-sentence summary of this developer",
  "strengths": ["strength1", "strength2", "strength3"],
  "primary_languages": ["lang1", "lang2"],
  "notable_repos": ["repo1", "repo2"],
  "career_stage": "junior | mid-level | senior | staff | distinguished"
}

Always call the tools first before producing your summary. Respond with ONLY the JSON object as your final answer (no markdown fences).`;

// -- Steps --

/** Emit a progress message. Separate step so it flushes to the stream
 *  before the next (potentially long-running) step starts. */
export async function emitProgress(
	phase: InvestigationProgress['phase'],
	key: string,
	params?: Record<string, string | number>,
	status?: InvestigationProgress['status'],
) {
	'use step';
	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase, key, params, status });
	} finally {
		writer.releaseLock();
	}
}

/** Call a specific provider. Returns the choice. Throws ProviderUnavailableError on rate limit. */
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

/** Execute a single tool call against the GitHub API. */
export async function executeToolCall(name: string, args: Record<string, string>) {
	'use step';

	switch (name) {
		case 'get_github_profile': {
			const res = await fetch(
				`https://api.github.com/users/${encodeURIComponent(args.username)}`,
				{
					headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				},
			);
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
				`https://api.github.com/users/${encodeURIComponent(args.username)}/repos?sort=stars&per_page=10&type=owner`,
				{
					headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				},
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
				})),
			);
		}
		default:
			return JSON.stringify({ error: `Unknown tool: ${name}` });
	}
}
