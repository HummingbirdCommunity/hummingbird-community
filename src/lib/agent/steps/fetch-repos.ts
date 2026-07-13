// Step: fetch a GitHub user's top public repositories via REST API.
// Unauthenticated, enough for Phase 0 validation.

import { getWritable } from 'workflow';

import type { InvestigationProgress } from '../types';
import { USER_AGENT, REQUEST_TIMEOUT_MS } from '@/lib/github/http';

export interface GitHubRepo {
	name: string;
	full_name: string;
	description: string | null;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	fork: boolean;
	html_url: string;
	topics: string[];
}

export async function fetchTopRepos(username: string): Promise<GitHubRepo[]> {
	'use step';

	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase: 'repos', message: `Fetching top repositories for ${username}...` });
	} finally {
		writer.releaseLock();
	}

	const res = await fetch(
		`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=stars&per_page=10&type=owner`,
		{
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/vnd.github+json',
			},
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		},
	);

	if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

	return (await res.json()) as GitHubRepo[];
}
