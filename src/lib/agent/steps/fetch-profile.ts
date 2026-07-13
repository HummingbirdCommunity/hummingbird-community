// Step: fetch a GitHub user's public profile via REST API.
// Uses the unauthenticated endpoint (60 req/hr) — enough for Phase 0 validation.
// Phase 1 will switch to the authenticated GraphQL client for richer data.

import { getWritable } from 'workflow';

import type { InvestigationProgress } from '../types';
import { USER_AGENT, REQUEST_TIMEOUT_MS } from '@/lib/github/http';

export interface GitHubProfile {
	login: string;
	name: string | null;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	public_repos: number;
	public_gists: number;
	followers: number;
	following: number;
	created_at: string;
	updated_at: string;
	avatar_url: string;
	html_url: string;
}

export async function fetchGitHubProfile(username: string): Promise<GitHubProfile | null> {
	'use step';

	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase: 'profile', message: `Fetching GitHub profile for ${username}...` });
	} finally {
		writer.releaseLock();
	}

	const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
		headers: {
			'User-Agent': USER_AGENT,
			Accept: 'application/vnd.github+json',
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

	return (await res.json()) as GitHubProfile;
}
