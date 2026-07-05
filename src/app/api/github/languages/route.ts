import { NextResponse } from 'next/server';

import { decryptToken } from '@/lib/github/crypto';
import { aggregateLanguages, GitHubRateLimitError } from '@/lib/github/languages';
import { hasRequiredScopes } from '@/lib/github/oauth';
import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — decryptToken uses node:crypto.
export const runtime = 'nodejs';

// Re-aggregate at most once a day: language stats drift slowly and the per-repo
// fan-out is API-expensive.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedStats {
	languages: Record<string, number>;
	repoCount: number;
}

function okResponse(stats: CachedStats, computedAt: string, stale: boolean): NextResponse {
	return NextResponse.json({ status: 'ok', ...stats, computedAt, stale });
}

// Return the signed-in user's public-repo language distribution, computing it
// from GitHub when the cache is missing or stale and caching the result.
export async function GET(request: Request): Promise<NextResponse> {
	const user = await getUserFromRequest(request);
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('github_connections')
		.select('access_token_encrypted, scopes, github_username, language_stats, languages_fetched_at')
		.eq('user_id', user.id)
		.maybeSingle();
	if (error) {
		return NextResponse.json({ error: 'Failed to load connection' }, { status: 500 });
	}
	if (!data) {
		return NextResponse.json({ status: 'not-connected' });
	}

	// Connected before public_repo was requested — the token can't read repos, so
	// ask the user to reconnect rather than failing every fetch.
	if (!hasRequiredScopes(data.scopes)) {
		return NextResponse.json({ status: 'needs-reauth' });
	}

	const cached = (data.language_stats as CachedStats | null) ?? null;
	const fetchedAt = data.languages_fetched_at as string | null;
	if (cached && fetchedAt && Date.now() - new Date(fetchedAt).getTime() < CACHE_TTL_MS) {
		return okResponse(cached, fetchedAt, false);
	}

	try {
		const aggregate = await aggregateLanguages(decryptToken(data.access_token_encrypted), data.github_username);
		const stats: CachedStats = { languages: aggregate.languages, repoCount: aggregate.repoCount };
		const { error: writeError } = await supabase
			.from('github_connections')
			.update({ language_stats: stats, languages_fetched_at: aggregate.computedAt })
			.eq('user_id', user.id);
		if (writeError) {
			console.error('[github-languages] failed to cache stats:', writeError);
		}
		return okResponse(stats, aggregate.computedAt, false);
	} catch (err) {
		// Per convention: a fetch failure must not overwrite the cache. Keep the
		// previous value and retry next refresh; serve stale data if we have any.
		console.error('[github-languages] aggregation failed:', err);
		if (cached && fetchedAt) {
			return okResponse(cached, fetchedAt, true);
		}
		return NextResponse.json({ status: err instanceof GitHubRateLimitError ? 'rate-limited' : 'error' });
	}
}
