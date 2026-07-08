// Shared error types for the GitHub integration modules.

// Distinct from a generic failure so route handlers can surface a "try again
// later" state instead of a hard error when GitHub throttles us.
export class GitHubRateLimitError extends Error {
	constructor() {
		super('GitHub API rate limit exceeded');
		this.name = 'GitHubRateLimitError';
	}
}
