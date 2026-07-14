// Resolve a user's stored GitHub OAuth token for server-side GitHub API calls.
//
// The agent reuses the *requesting* user's connected token (HB-6) rather than a
// dedicated PAT, so it never burns the investigated person's quota and needs no
// new credential. The token is decrypted here, on demand, and handed straight to
// the caller — it is never threaded through durable workflow state.

import { decryptToken } from '@/lib/github/crypto';
import { supabase } from '@/lib/supabase/server';

/**
 * Return the decrypted GitHub access token for a connected user, or null when
 * the user hasn't connected GitHub (or the row can't be decrypted). Callers
 * fall back to anonymous requests when this is null.
 */
export async function getUserGitHubToken(userId: string): Promise<string | null> {
	const { data, error } = await supabase
		.from('github_connections')
		.select('access_token_encrypted')
		.eq('user_id', userId)
		.maybeSingle();

	if (error || !data) return null;

	try {
		return decryptToken(data.access_token_encrypted);
	} catch (err) {
		console.error('[agent] failed to decrypt GitHub token:', err);
		return null;
	}
}
