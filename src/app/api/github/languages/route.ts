import { NextResponse } from 'next/server';

import { decryptToken } from '@/lib/github/crypto';
import { GitHubRateLimitError } from '@/lib/github/errors';
import { aggregateLanguages } from '@/lib/github/languages';
import { hasRequiredScopes } from '@/lib/github/oauth';
import { resolveTargetUserId } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — decryptToken uses node:crypto.
export const runtime = 'nodejs';

// Re-aggregate at most once a day: language stats drift slowly and the per-repo
// fan-out is API-expensive.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface Snapshot {
	languages: Record<string, number>;
	repoCount: number;
	computedAt: string;
}

function okResponse(snapshot: Snapshot, stale: boolean, disconnected: boolean): NextResponse {
	return NextResponse.json({ status: 'ok', ...snapshot, stale, disconnected });
}

// Return the signed-in user's public-repo language distribution. The snapshot
// lives in its own table so it outlives the GitHub connection: after a
// disconnect we keep serving the last snapshot (disconnected=true) rather than
// dropping it. While connected, recompute when the cache is missing or stale.
export async function GET(request: Request): Promise<NextResponse> {
	const target = await resolveTargetUserId(request);
	if (!target) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [{ data: connection, error: connectionError }, { data: stats, error: statsError }] = await Promise.all([
		supabase
			.from('github_connections')
			.select('access_token_encrypted, scopes, github_username')
			.eq('user_id', target.targetId)
			.maybeSingle(),
		supabase
			.from('github_language_stats')
			.select('language_stats, repo_count, computed_at')
			.eq('user_id', target.targetId)
			.maybeSingle(),
	]);
	if (connectionError || statsError) {
		return NextResponse.json({ error: 'Failed to load language stats' }, { status: 500 });
	}

	const cached: Snapshot | null = stats
		? {
				languages: stats.language_stats as Record<string, number>,
				repoCount: stats.repo_count as number,
				computedAt: stats.computed_at as string,
			}
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
		const aggregate = await aggregateLanguages(
			decryptToken(connection.access_token_encrypted),
			connection.github_username
		);
		const { error: writeError } = await supabase.from('github_language_stats').upsert(
			{
				user_id: target.targetId,
				language_stats: aggregate.languages,
				repo_count: aggregate.repoCount,
				computed_at: aggregate.computedAt,
			},
			{ onConflict: 'user_id' }
		);
		if (writeError) {
			console.error('[github-languages] failed to cache stats:', writeError);
		}
		return okResponse(
			{ languages: aggregate.languages, repoCount: aggregate.repoCount, computedAt: aggregate.computedAt },
			false,
			false
		);
	} catch (err) {
		// Per convention: a fetch failure must not overwrite the cache. Keep the
		// previous value and retry next refresh; serve stale data if we have any.
		console.error('[github-languages] aggregation failed:', err);
		if (cached) {
			return okResponse(cached, true, false);
		}
		return NextResponse.json({ status: err instanceof GitHubRateLimitError ? 'rate-limited' : 'error' });
	}
}
