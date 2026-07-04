// GitHub OAuth HTTP calls (HB-6). Server-only — used exclusively by the
// /api/github/* route handlers.

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

// Minimal identity scope: read the user's public profile. Broader scopes are
// requested later, per-ticket, only when a feature actually needs them.
const SCOPE = 'read:user';

const USER_AGENT = 'hummingbird-community';

// Bound each GitHub call so a slow/hung response can't tie up a route handler.
const REQUEST_TIMEOUT_MS = 10_000;

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set`);
	return value;
}

function redirectUri(): string {
	return `${requireEnv('NEXT_PUBLIC_PUBLIC_BASE_URL')}/api/github/callback`;
}

export function buildAuthorizeUrl(state: string): string {
	const params = new URLSearchParams({
		client_id: requireEnv('GITHUB_CLIENT_ID'),
		redirect_uri: redirectUri(),
		scope: SCOPE,
		state,
	});
	return `${AUTHORIZE_URL}?${params.toString()}`;
}

export interface GitHubTokens {
	accessToken: string;
	tokenType: string | null;
	scope: string | null;
	refreshToken: string | null;
	// Absolute expiry instants (ms since epoch), or null when the token doesn't
	// expire (a classic OAuth App without token expiration returns neither).
	expiresAt: number | null;
	refreshTokenExpiresAt: number | null;
}

export async function exchangeCodeForToken(code: string): Promise<GitHubTokens> {
	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
		body: new URLSearchParams({
			client_id: requireEnv('GITHUB_CLIENT_ID'),
			client_secret: requireEnv('GITHUB_CLIENT_SECRET'),
			code,
			redirect_uri: redirectUri(),
		}),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`GitHub token exchange failed: ${response.status}`);
	}
	const data = (await response.json()) as {
		access_token?: string;
		token_type?: string;
		scope?: string;
		refresh_token?: string;
		expires_in?: number;
		refresh_token_expires_in?: number;
		error?: string;
		error_description?: string;
	};
	if (data.error || !data.access_token) {
		throw new Error(`GitHub token exchange error: ${data.error_description ?? data.error ?? 'no access_token'}`);
	}
	const now = Date.now();
	return {
		accessToken: data.access_token,
		tokenType: data.token_type ?? null,
		scope: data.scope ?? null,
		refreshToken: data.refresh_token ?? null,
		expiresAt: data.expires_in ? now + data.expires_in * 1000 : null,
		refreshTokenExpiresAt: data.refresh_token_expires_in ? now + data.refresh_token_expires_in * 1000 : null,
	};
}

export interface GitHubUser {
	id: number;
	login: string;
	avatarUrl: string | null;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
	const response = await fetch(USER_URL, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': USER_AGENT,
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`GitHub user fetch failed: ${response.status}`);
	}
	const data = (await response.json()) as { id: number; login: string; avatar_url?: string };
	return { id: data.id, login: data.login, avatarUrl: data.avatar_url ?? null };
}

// Best-effort: tell GitHub to revoke this authorization's copy of the token so a
// disconnect actually invalidates it, not just forgets it. Callers ignore
// failures — the local row is deleted regardless.
export async function revokeToken(accessToken: string): Promise<void> {
	const clientId = requireEnv('GITHUB_CLIENT_ID');
	const basic = Buffer.from(`${clientId}:${requireEnv('GITHUB_CLIENT_SECRET')}`).toString('base64');
	await fetch(`https://api.github.com/applications/${clientId}/token`, {
		method: 'DELETE',
		headers: {
			Authorization: `Basic ${basic}`,
			Accept: 'application/vnd.github+json',
			'User-Agent': USER_AGENT,
		},
		body: JSON.stringify({ access_token: accessToken }),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
}
