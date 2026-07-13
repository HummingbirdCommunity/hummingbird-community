// Shared error types for the GitHub integration modules.

// General GitHub API error with HTTP status code, used by the shared GraphQL
// client and agent steps to distinguish retryable from fatal failures.
export class GitHubApiError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'GitHubApiError';
		this.status = status;
	}
}

// Distinct from a generic failure so route handlers can surface a "try again
// later" state instead of a hard error when GitHub throttles us.
export class GitHubRateLimitError extends GitHubApiError {
	readonly resetAt: number | null;
	constructor(resetAt?: number) {
		const waitInfo = resetAt ? `, resets in ${Math.max(0, resetAt - Math.floor(Date.now() / 1000))}s` : '';
		super(`GitHub API rate limit exceeded${waitInfo}`, 429);
		this.name = 'GitHubRateLimitError';
		this.resetAt = resetAt ?? null;
	}
}
