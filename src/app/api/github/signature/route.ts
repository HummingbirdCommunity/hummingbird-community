import { NextResponse } from 'next/server';

import type { SignatureRepo } from '@/lib/github/signature';

import { decryptToken } from '@/lib/github/crypto';
import { GitHubRateLimitError } from '@/lib/github/errors';
import { hasRequiredScopes } from '@/lib/github/oauth';
import { getUserFromRequest } from '@/lib/github/session';
import { aggregateSignatureRepos } from '@/lib/github/signature';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — decryptToken uses node:crypto.
export const runtime = 'nodejs';

// Re-aggregate at most once a day: a user's pinned and top-starred repos drift
// slowly and the GraphQL query shouldn't run on every page load.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Snapshot {
	repos: SignatureRepo[];
	computedAt: string;
}

function okResponse(snapshot: Snapshot, stale: boolean, disconnected: boolean): NextResponse {
	return NextResponse.json({ status: 'ok', ...snapshot, stale, disconnected });
}

// Return the signed-in user's signature repositories (pinned + top-starred). The
// snapshot lives in its own table so it outlives the GitHub connection: after a
// disconnect we keep serving the last snapshot (disconnected=true) rather than
// dropping it. While connected, recompute when the cache is missing or stale.
export async function GET(request: Request): Promise<NextResponse> {
	const user = await getUserFromRequest(request);
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [{ data: connection, error: connectionError }, { data: snapshot, error: snapshotError }] = await Promise.all([
		supabase
			.from('github_connections')
			.select('access_token_encrypted, scopes, github_username')
			.eq('user_id', user.id)
			.maybeSingle(),
		supabase.from('github_signature_repos').select('repos, computed_at').eq('user_id', user.id).maybeSingle(),
	]);
	if (connectionError || snapshotError) {
		return NextResponse.json({ error: 'Failed to load signature repos' }, { status: 500 });
	}

	const cached: Snapshot | null = snapshot
		? { repos: snapshot.repos as SignatureRepo[], computedAt: snapshot.computed_at as string }
		: null;

	// No connection: the snapshot (if any) is frozen — show it as paused.
	if (!connection) {
		return cached ? okResponse(cached, false, true) : NextResponse.json({ status: 'no-data' });
	}

	// Connected before public_repo was requested — the token can't read repos, so
	// ask the user to reconnect rather than failing every fetch.
	if (!hasRequiredScopes(connection.scopes)) {
		return NextResponse.json({ status: 'needs-reauth' });
	}

	if (cached && Date.now() - new Date(cached.computedAt).getTime() < CACHE_TTL_MS) {
		return okResponse(cached, false, false);
	}

	try {
		const aggregate = await aggregateSignatureRepos(
			decryptToken(connection.access_token_encrypted),
			connection.github_username
		);
		const { error: writeError } = await supabase.from('github_signature_repos').upsert(
			{
				user_id: user.id,
				repos: aggregate.repos,
				computed_at: aggregate.computedAt,
			},
			{ onConflict: 'user_id' }
		);
		if (writeError) {
			console.error('[github-signature] failed to cache repos:', writeError);
		}
		return okResponse({ repos: aggregate.repos, computedAt: aggregate.computedAt }, false, false);
	} catch (err) {
		// Per convention: a fetch failure must not overwrite the cache. Keep the
		// previous value and retry next refresh; serve stale data if we have any.
		console.error('[github-signature] aggregation failed:', err);
		if (cached) {
			return okResponse(cached, true, false);
		}
		return NextResponse.json({ status: err instanceof GitHubRateLimitError ? 'rate-limited' : 'error' });
	}
}
