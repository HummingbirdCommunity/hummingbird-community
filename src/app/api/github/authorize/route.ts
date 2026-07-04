import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';

import { buildAuthorizeUrl } from '@/lib/github/oauth';
import { encodeState, getUserFromRequest, STATE_COOKIE, stateCookieOptions } from '@/lib/github/session';

// Runs on the Node.js runtime — the GitHub helpers use node:crypto and Buffer.
export const runtime = 'nodejs';

// Start the GitHub OAuth flow for the signed-in user. Returns the authorize URL
// for the client to navigate to, and sets a signed state cookie binding this
// flow to the user so the (token-less) callback knows whom to link.
export async function GET(request: Request): Promise<NextResponse> {
	const user = await getUserFromRequest(request);
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const state = randomUUID();
	const response = NextResponse.json({ url: buildAuthorizeUrl(state) });
	response.cookies.set(STATE_COOKIE, encodeState({ state, userId: user.id }), stateCookieOptions);
	return response;
}
