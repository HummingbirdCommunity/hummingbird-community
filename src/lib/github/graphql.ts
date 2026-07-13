// Shared GraphQL client for the GitHub API. Accepts an explicit token so it
// works for both user OAuth tokens (existing features) and the agent's
// dedicated token (investigation workflow).

import { GitHubApiError, GitHubRateLimitError } from '@/lib/github/errors';
import { isRateLimited, REQUEST_TIMEOUT_MS, USER_AGENT } from '@/lib/github/http';

const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export interface GraphQLResult<T = Record<string, unknown>> {
	data: T | null;
	errors?: Array<{ type?: string; message: string }>;
}

/**
 * Execute a GraphQL query against the GitHub API.
 *
 * The caller provides the token — this keeps the client agnostic about
 * whether the token is a user OAuth token, a PAT, or a GitHub App
 * installation token.
 */
export async function queryGitHubGraphQL<T = Record<string, unknown>>(
	query: string,
	variables: Record<string, unknown>,
	token: string,
): Promise<GraphQLResult<T>> {
	const response = await fetch(GITHUB_GRAPHQL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT,
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});

	if (isRateLimited(response)) {
		const resetHeader = response.headers.get('x-ratelimit-reset');
		throw new GitHubRateLimitError(resetHeader ? Number(resetHeader) : undefined);
	}

	if (!response.ok) {
		throw new GitHubApiError(`GitHub GraphQL request failed: ${response.status}`, response.status);
	}

	const body = (await response.json()) as GraphQLResult<T>;

	// GraphQL can report errors inside a 200 body; a throttled query carries
	// a RATE_LIMITED error type rather than a 429 HTTP status.
	if (body.errors?.length) {
		if (body.errors.some((e) => e.type === 'RATE_LIMITED')) {
			throw new GitHubRateLimitError();
		}
		throw new GitHubApiError(`GitHub GraphQL error: ${body.errors[0].message}`, 200);
	}

	return body;
}
