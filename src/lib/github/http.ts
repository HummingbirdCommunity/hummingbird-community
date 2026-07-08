// Shared low-level HTTP constants and helpers for the GitHub integration modules.

export const USER_AGENT = 'hummingbird-community';

// Bound each GitHub call so a slow/hung response can't tie up a route handler.
export const REQUEST_TIMEOUT_MS = 10_000;

// GitHub signals throttling with 429, or a 403 once the rate-limit budget is spent.
export function isRateLimited(response: Response): boolean {
	if (response.status === 429) return true;
	return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}
