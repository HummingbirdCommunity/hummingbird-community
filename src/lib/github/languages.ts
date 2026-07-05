// Aggregate the language byte-counts across a user's public repositories (HB-7).
// Server-only — used by the /api/github/languages route with a decrypted token.

const API_BASE = 'https://api.github.com';
const USER_AGENT = 'hummingbird-community';
const REQUEST_TIMEOUT_MS = 10_000;

// GitHub's max page size, so repo listing needs the fewest round-trips.
const PER_PAGE = 100;
// Safety cap on pagination: 10 pages ≈ 1000 repos. Bounds worst-case API spend
// for an outlier account; the chart only surfaces the top few languages anyway.
const MAX_PAGES = 10;
// Fan-out is one request per repo (fork probe + languages), so cap in-flight
// calls to stay well under GitHub's secondary-rate-limit thresholds.
const CONCURRENCY = 5;

// Distinct from a generic failure so the route can surface a "try again later"
// state instead of a hard error when GitHub throttles us.
export class GitHubRateLimitError extends Error {
	constructor() {
		super('GitHub API rate limit exceeded');
		this.name = 'GitHubRateLimitError';
	}
}

function isRateLimited(response: Response): boolean {
	if (response.status === 429) return true;
	return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

async function ghFetch(accessToken: string, path: string): Promise<Response> {
	const response = await fetch(`${API_BASE}${path}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': USER_AGENT,
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (isRateLimited(response)) throw new GitHubRateLimitError();
	return response;
}

// Run fn over items with at most `limit` calls in flight, preserving order.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	async function worker(): Promise<void> {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

interface RepoRef {
	owner: string;
	name: string;
	fork: boolean;
}

// List the public repos the user owns (excludes repos they only collaborate on).
async function fetchOwnedPublicRepos(accessToken: string): Promise<RepoRef[]> {
	const repos: RepoRef[] = [];
	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await ghFetch(
			accessToken,
			`/user/repos?visibility=public&affiliation=owner&per_page=${PER_PAGE}&page=${page}`
		);
		if (!response.ok) throw new Error(`GitHub repo list failed: ${response.status}`);
		const batch = (await response.json()) as Array<{ name: string; fork: boolean; owner: { login: string } }>;
		for (const repo of batch) {
			repos.push({ owner: repo.owner.login, name: repo.name, fork: repo.fork });
		}
		if (batch.length < PER_PAGE) break;
	}
	return repos;
}

// Approximate "the user contributed to this fork" with "the fork has a commit
// authored by them" — a single cheap probe. Precisely detecting merged work is
// far more expensive, so this stands in for it.
async function forkHasUserCommits(accessToken: string, repo: RepoRef, login: string): Promise<boolean> {
	const response = await ghFetch(
		accessToken,
		`/repos/${repo.owner}/${repo.name}/commits?author=${encodeURIComponent(login)}&per_page=1`
	);
	// An empty repository returns 409 here; that's genuinely "no commits", not a
	// failure. Any other error aborts the aggregate (see aggregateLanguages).
	if (response.status === 409) return false;
	if (!response.ok) {
		throw new Error(`GitHub commit probe failed for ${repo.owner}/${repo.name}: ${response.status}`);
	}
	const commits = (await response.json()) as unknown[];
	return commits.length > 0;
}

// { language: bytes } for one repo.
async function fetchRepoLanguages(accessToken: string, repo: RepoRef): Promise<Record<string, number>> {
	const response = await ghFetch(accessToken, `/repos/${repo.owner}/${repo.name}/languages`);
	if (!response.ok) {
		throw new Error(`GitHub languages fetch failed for ${repo.owner}/${repo.name}: ${response.status}`);
	}
	return (await response.json()) as Record<string, number>;
}

export interface LanguageAggregate {
	// Total bytes per language across the counted repos.
	languages: Record<string, number>;
	// How many repos actually contributed to the totals.
	repoCount: number;
	computedAt: string;
}

// Sum language bytes across the user's owned public repos, counting forks only
// when the user has authored commits in them. Any GitHub failure aborts the
// whole aggregate (throws) rather than returning a partial total — the caller
// then keeps the previous cache and retries on the next refresh. Throws
// GitHubRateLimitError when throttled; other failures bubble up as Errors.
export async function aggregateLanguages(accessToken: string, login: string): Promise<LanguageAggregate> {
	const repos = await fetchOwnedPublicRepos(accessToken);

	const forks = repos.filter((repo) => repo.fork);
	const countedForks = (
		await mapWithConcurrency(forks, CONCURRENCY, async (repo) =>
			(await forkHasUserCommits(accessToken, repo, login)) ? repo : null
		)
	).filter((repo): repo is RepoRef => repo !== null);
	const counted = [...repos.filter((repo) => !repo.fork), ...countedForks];

	const perRepo = await mapWithConcurrency(counted, CONCURRENCY, (repo) => fetchRepoLanguages(accessToken, repo));

	const languages: Record<string, number> = {};
	for (const repoLanguages of perRepo) {
		for (const [language, bytes] of Object.entries(repoLanguages)) {
			languages[language] = (languages[language] ?? 0) + bytes;
		}
	}

	return { languages, repoCount: counted.length, computedAt: new Date().toISOString() };
}
