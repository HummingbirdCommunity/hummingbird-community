import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { routing } from '@/i18n/routing';
import { encryptToken } from '@/lib/github/crypto';
import { exchangeCodeForToken, fetchGitHubUser } from '@/lib/github/oauth';
import { decodeState, STATE_COOKIE } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — the GitHub helpers use node:crypto and Buffer.
export const runtime = 'nodejs';

function toTimestamp(epochMs: number | null): string | null {
	return epochMs ? new Date(epochMs).toISOString() : null;
}

// Complete the OAuth flow: verify the signed state, exchange the code for a
// token, look up the GitHub identity, store it encrypted, then bounce the user
// back to the dashboard. Always clears the one-time state cookie.
export async function GET(request: NextRequest): Promise<NextResponse> {
	const url = new URL(request.url);
	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');
	const cookieState = decodeState(request.cookies.get(STATE_COOKIE)?.value);

	function redirect(status: 'connected' | 'error' | 'already-linked'): NextResponse {
		// Return the user to the dashboard in the language they left from. The
		// callback path carries no locale, so read next-intl's own NEXT_LOCALE
		// cookie; `as-needed` routing means the default locale takes no prefix.
		const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
		const locale = (routing.locales as readonly string[]).includes(cookieLocale ?? '')
			? cookieLocale
			: routing.defaultLocale;
		const path = locale === routing.defaultLocale ? '/dashboard' : `/${locale}/dashboard`;

		const target = new URL(path, request.url);
		target.searchParams.set('github', status);
		const response = NextResponse.redirect(target);
		response.cookies.delete({ name: STATE_COOKIE, path: '/' });
		return response;
	}

	// GitHub sends ?error=access_denied when the user declines; guard that plus a
	// failed/forged state (CSRF) and a missing code before touching GitHub.
	if (url.searchParams.get('error') || !code || !cookieState || cookieState.state !== returnedState) {
		return redirect('error');
	}

	try {
		const tokens = await exchangeCodeForToken(code);
		const githubUser = await fetchGitHubUser(tokens.accessToken);

		const { error } = await supabase.from('github_connections').upsert(
			{
				user_id: cookieState.userId,
				github_user_id: githubUser.id,
				github_username: githubUser.login,
				avatar_url: githubUser.avatarUrl,
				access_token_encrypted: encryptToken(tokens.accessToken),
				refresh_token_encrypted: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
				token_type: tokens.tokenType,
				scopes: tokens.scope,
				expires_at: toTimestamp(tokens.expiresAt),
				refresh_token_expires_at: toTimestamp(tokens.refreshTokenExpiresAt),
				connected_at: new Date().toISOString(),
			},
			{ onConflict: 'user_id' }
		);
		if (error) {
			// 23505 on github_user_id: this GitHub account is already linked to a
			// different user (the unique constraint doing its anti-gaming job).
			if (error.code === '23505') return redirect('already-linked');
			throw error;
		}

		return redirect('connected');
	} catch (err) {
		console.error('[github-callback] failed to connect:', err);
		return redirect('error');
	}
}
