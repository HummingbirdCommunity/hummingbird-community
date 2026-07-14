// Contribution deep-dive for the research agent (design doc Phase 3).
//
// The headline signal here is *participation-weighted* language usage. Byte-based
// language stats (GitHub's /languages endpoint) measure how big each repo's
// codebase is, not how much the investigated user wrote — a user who made one
// commit to a huge C repo would read as "97% C". Weighting by the user's own
// commit counts per repository fixes that: 1000 commits to a Python repo outweigh
// a single drive-by commit to a C repo. See weightLanguagesByParticipation.
//
// GitHub's contributionsCollection is scoped to a time window, so lifetime
// coverage needs one collection per year. To bound API spend we sample up to
// three representative years (earliest, middle, latest) and merge them, matching
// the doc's depth heuristic ("Contribution years span > 5 years → scan 3 years").

import { queryGitHubGraphQL } from '@/lib/github/graphql';

/** One repository the user committed to, with their commit count in the window. */
export interface RepoCommitCount {
	nameWithOwner: string;
	commits: number;
	primaryLanguage: string | null;
	stars: number;
	isFork: boolean;
	ownedByUser: boolean;
}

/** A language ranked by how many of the user's commits landed in repos of that language. */
export interface LanguageParticipation {
	language: string;
	commits: number;
	percentage: number;
}

export interface ContributionSummary {
	activeYears: number[];
	yearsSampled: number[];
	totals: {
		commits: number;
		pullRequests: number;
		issues: number;
		reviews: number;
	};
	languageParticipation: LanguageParticipation[];
	topReposByCommits: RepoCommitCount[];
}

/**
 * Rank languages by the user's commit participation rather than repo byte size.
 * Repos with no detectable primary language are skipped. Percentages are of the
 * total attributable commits and rounded to one decimal. Pure — unit-testable in
 * isolation from the GitHub API.
 */
export function weightLanguagesByParticipation(repos: RepoCommitCount[]): LanguageParticipation[] {
	const byLanguage = new Map<string, number>();
	for (const repo of repos) {
		if (!repo.primaryLanguage) continue;
		byLanguage.set(repo.primaryLanguage, (byLanguage.get(repo.primaryLanguage) ?? 0) + repo.commits);
	}

	const total = [...byLanguage.values()].reduce((sum, n) => sum + n, 0);
	return [...byLanguage.entries()]
		.map(([language, commits]) => ({
			language,
			commits,
			percentage: total > 0 ? Math.round((commits / total) * 1000) / 10 : 0,
		}))
		.sort((a, b) => b.commits - a.commits);
}

/** Pick up to three representative years: earliest, middle, latest (deduped). */
function sampleYears(years: number[]): number[] {
	if (years.length <= 3) return [...years];
	const sorted = [...years].sort((a, b) => a - b);
	const picks = new Set<number>([sorted[0], sorted[Math.floor(sorted.length / 2)], sorted[sorted.length - 1]]);
	return [...picks].sort((a, b) => a - b);
}

interface CollectionNode {
	totalCommitContributions: number;
	totalPullRequestContributions: number;
	totalIssueContributions: number;
	totalPullRequestReviewContributions: number;
	commitContributionsByRepository: Array<{
		repository: {
			nameWithOwner: string;
			isFork: boolean;
			stargazerCount: number;
			owner: { login: string };
			primaryLanguage: { name: string } | null;
		};
		contributions: { totalCount: number };
	}>;
}

const COLLECTION_FIELDS = `
	totalCommitContributions
	totalPullRequestContributions
	totalIssueContributions
	totalPullRequestReviewContributions
	commitContributionsByRepository(maxRepositories: 25) {
		repository {
			nameWithOwner
			isFork
			stargazerCount
			owner { login }
			primaryLanguage { name }
		}
		contributions { totalCount }
	}`;

/**
 * Fetch and merge the user's contribution activity across sampled years. Two
 * GraphQL round-trips: one for the list of active years, one aliased query that
 * pulls every sampled year at once. Requires a token (GraphQL rejects anonymous
 * requests); the caller surfaces a graceful error when the requester hasn't
 * connected GitHub.
 */
export async function fetchContributions(token: string, username: string): Promise<ContributionSummary> {
	const yearsResult = await queryGitHubGraphQL<{
		user: { contributionsCollection: { contributionYears: number[] } } | null;
	}>(
		`query($login: String!) { user(login: $login) { contributionsCollection { contributionYears } } }`,
		{ login: username },
		token
	);

	const activeYears = yearsResult.data?.user?.contributionsCollection?.contributionYears ?? [];
	if (activeYears.length === 0) {
		return {
			activeYears: [],
			yearsSampled: [],
			totals: { commits: 0, pullRequests: 0, issues: 0, reviews: 0 },
			languageParticipation: [],
			topReposByCommits: [],
		};
	}

	const yearsSampled = sampleYears(activeYears);

	// Build one aliased query covering every sampled year (y0, y1, …), each with
	// its own from/to window, so the whole sample costs a single round-trip.
	const varDecls = ['$login: String!'];
	const aliases: string[] = [];
	const variables: Record<string, unknown> = { login: username };
	yearsSampled.forEach((year, i) => {
		varDecls.push(`$from${i}: DateTime!`, `$to${i}: DateTime!`);
		aliases.push(`y${i}: contributionsCollection(from: $from${i}, to: $to${i}) {${COLLECTION_FIELDS}\n}`);
		variables[`from${i}`] = `${year}-01-01T00:00:00Z`;
		variables[`to${i}`] = `${year}-12-31T23:59:59Z`;
	});

	const query = `query(${varDecls.join(', ')}) { user(login: $login) {\n${aliases.join('\n')}\n} }`;
	const result = await queryGitHubGraphQL<{ user: Record<string, CollectionNode> | null }>(query, variables, token);

	const user = result.data?.user;
	const totals = { commits: 0, pullRequests: 0, issues: 0, reviews: 0 };
	// Merge per-repo commit counts across the sampled years.
	const repoMap = new Map<string, RepoCommitCount>();

	if (user) {
		for (let i = 0; i < yearsSampled.length; i++) {
			const collection = user[`y${i}`];
			if (!collection) continue;
			totals.commits += collection.totalCommitContributions;
			totals.pullRequests += collection.totalPullRequestContributions;
			totals.issues += collection.totalIssueContributions;
			totals.reviews += collection.totalPullRequestReviewContributions;

			for (const entry of collection.commitContributionsByRepository) {
				const repo = entry.repository;
				const existing = repoMap.get(repo.nameWithOwner);
				const commits = entry.contributions.totalCount;
				if (existing) {
					existing.commits += commits;
				} else {
					repoMap.set(repo.nameWithOwner, {
						nameWithOwner: repo.nameWithOwner,
						commits,
						primaryLanguage: repo.primaryLanguage?.name ?? null,
						stars: repo.stargazerCount,
						isFork: repo.isFork,
						ownedByUser: repo.owner.login.toLowerCase() === username.toLowerCase(),
					});
				}
			}
		}
	}

	const repos = [...repoMap.values()].sort((a, b) => b.commits - a.commits);

	return {
		activeYears,
		yearsSampled,
		totals,
		languageParticipation: weightLanguagesByParticipation(repos),
		topReposByCommits: repos.slice(0, 10),
	};
}
