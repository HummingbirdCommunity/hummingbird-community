// Profile reuse (HB-28) — the read side of scenario 2 (investigating others).
// The write side (upsertDeveloperProfile) lives in steps/investigate.ts; here we
// decide whether an existing profile can be served instead of regenerating.

import { supabase } from '@/lib/supabase/server';

import type { DeveloperProfileRow, Provenance } from './types';

/** The reuse / cache / freshness decision tree (milestone-3 design §7), keyed by
 *  normalized `github_login`. Returns the profile to serve, or null to regenerate.
 *
 *    1. authored + visibility=public → serve directly (the subject's own profile
 *       always wins; `authored > observed` is also enforced structurally by the
 *       (github_login, source) upsert key, so observed can never overwrite it).
 *    2. else observed + now < fresh_until (within 7 days) → serve the cache.
 *    3. else → miss: the caller regenerates an observed profile, and its upsert
 *       overwrites any expired observed row (lazy overwrite).
 *
 *  On a lookup error we log and treat it as a miss (fail open to regeneration)
 *  rather than serving anything stale or failing the request. */
export async function findReusableProfile(githubLogin: string): Promise<DeveloperProfileRow | null> {
	const { data, error } = await supabase.from('developer_profiles').select('*').eq('github_login', githubLogin);

	if (error) {
		console.error('[profile-reuse] lookup failed, treating as cache miss:', error);
		return null;
	}

	const rows = (data ?? []) as DeveloperProfileRow[];

	const authored = rows.find((r) => r.source === 'authored');
	if (authored && authored.visibility === 'public') return authored;

	const observed = rows.find((r) => r.source === 'observed');
	if (observed && observed.fresh_until && new Date(observed.fresh_until) > new Date()) return observed;

	return null;
}

/** The client-facing result shape produced from a persisted profile, shared by
 *  the investigate (cache hit) and result routes so both stay in lock-step. Reads
 *  identity and tool calls out of `provenance`; `username` is passed in since it's
 *  the caller's as-typed value (result route) or the reused login. */
export function buildInvestigationResult(
	row: Pick<DeveloperProfileRow, 'summary' | 'evidence_snapshot' | 'provenance'>,
	username: string
) {
	const provenance = row.provenance as Provenance | null;
	return {
		ok: true as const,
		username,
		profile: provenance?.profile ?? null,
		summary: row.summary,
		evidenceSnapshot: row.evidence_snapshot ?? null,
		toolCalls: provenance?.tool_calls ?? [],
	};
}
