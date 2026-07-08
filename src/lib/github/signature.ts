// Aggregate a user's "signature repositories" — the repos they pinned plus their
// top public repos by stars — for the profile card (HB-10). Server-only; used by
// the /api/github/signature route with a decrypted token.
//
// Everything comes from a single GraphQL query: pinned items aren't exposed by
// the REST API, and GraphQL can return the top-starred owned repos in the same
// round-trip, so one request covers both sources.

import { GitHubRateLimitError } from '@/lib/github/errors';
import { isRateLimited, REQUEST_TIMEOUT_MS, USER_AGENT } from '@/lib/github/http';

const GRAPHQL_URL = 'https://api.github.com/graphql';

// GitHub allows at most 6 pinned items, so 6 is also the natural display cap for
// the merged list — and how many top-starred repos we ask for as fill.
const MAX_REPOS = 6;

export interface SignatureRepo {
	name: string;
	owner: string;
	nameWithOwner: string;
	description: string | null;
	language: string | null;
	stars: number;
	forks: number;
	url: string;
	isFork: boolean;
	// False when the repo belongs to someone else — a pinned org or other-user
	// repo. The card surfaces the owner in that case so provenance is clear.
	ownedByUser: boolean;
	pinned: boolean;
}

export interface SignatureReposAggregate {
	repos: SignatureRepo[];
	computedAt: string;
}

// The repo fields both the pinned and top-starred selections request.
const REPO_FIELDS = `
	name
	nameWithOwner
	description
	url
	isFork
	forkCount
	stargazerCount
	owner { login }
	primaryLanguage { name }`;

// pinnedItems is filtered to REPOSITORY (a user can also pin gists); the top list
// is owned, public, non-fork repos ordered by stars.
const QUERY = `
query SignatureRepos($login: String!) {
	user(login: $login) {
		pinnedItems(first: ${MAX_REPOS}, types: REPOSITORY) {
			nodes { ... on Repository {${REPO_FIELDS} } }
		}
		repositories(first: ${MAX_REPOS}, privacy: PUBLIC, isFork: false, ownerAffiliations: OWNER, orderBy: { field: STARGAZERS, direction: DESC }) {
			nodes {${REPO_FIELDS} }
		}
	}
}`;

interface RepoNode {
	name: string;
	nameWithOwner: string;
	description: string | null;
	url: string;
	isFork: boolean;
	forkCount: number;
	stargazerCount: number;
	owner: { login: string };
	primaryLanguage: { name: string } | null;
}

async function runQuery(accessToken: string, login: string): Promise<{ pinned: RepoNode[]; top: RepoNode[] }> {
	const response = await fetch(GRAPHQL_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json',
			'User-Agent': USER_AGENT,
		},
		body: JSON.stringify({ query: QUERY, variables: { login } }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (isRateLimited(response)) throw new GitHubRateLimitError();
	if (!response.ok) throw new Error(`GitHub GraphQL request failed: ${response.status}`);

	const body = (await response.json()) as {
		data?: { user: { pinnedItems: { nodes: RepoNode[] }; repositories: { nodes: RepoNode[] } } | null };
		errors?: Array<{ type?: string; message: string }>;
	};
	// GraphQL reports errors in a 200 body; a throttled query carries a
	// RATE_LIMITED error rather than a 429 status.
	if (body.errors?.length) {
		if (body.errors.some((error) => error.type === 'RATE_LIMITED')) throw new GitHubRateLimitError();
		throw new Error(`GitHub GraphQL error: ${body.errors[0].message}`);
	}
	const user = body.data?.user;
	if (!user) throw new Error('GitHub GraphQL returned no user');
	return { pinned: user.pinnedItems.nodes, top: user.repositories.nodes };
}

function toSignatureRepo(node: RepoNode, login: string, pinned: boolean): SignatureRepo {
	return {
		name: node.name,
		owner: node.owner.login,
		nameWithOwner: node.nameWithOwner,
		description: node.description,
		language: node.primaryLanguage?.name ?? null,
		stars: node.stargazerCount,
		forks: node.forkCount,
		url: node.url,
		isFork: node.isFork,
		ownedByUser: node.owner.login.toLowerCase() === login.toLowerCase(),
		pinned,
	};
}

// Merge pinned repos (in the user's chosen order) with the top-starred fill,
// deduped by owner/name and capped at MAX_REPOS. A repo that is both pinned and
// top-starred keeps its pinned slot. Any GitHub failure throws — the route keeps
// the previous cache rather than storing a partial result.
export async function aggregateSignatureRepos(accessToken: string, login: string): Promise<SignatureReposAggregate> {
	const { pinned, top } = await runQuery(accessToken, login);

	const ordered = [
		...pinned.map((node) => toSignatureRepo(node, login, true)),
		...top.map((node) => toSignatureRepo(node, login, false)),
	];

	const repos: SignatureRepo[] = [];
	const seen = new Set<string>();
	for (const repo of ordered) {
		const key = repo.nameWithOwner.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		repos.push(repo);
		if (repos.length >= MAX_REPOS) break;
	}

	return { repos, computedAt: new Date().toISOString() };
}
