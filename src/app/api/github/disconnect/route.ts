import { NextResponse } from 'next/server';

import { decryptToken } from '@/lib/github/crypto';
import { revokeToken } from '@/lib/github/oauth';
import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — the GitHub helpers use node:crypto and Buffer.
export const runtime = 'nodejs';

// Disconnect the signed-in user's GitHub account: revoke the token on GitHub
// (best-effort) and delete ONLY the github_connections row. Never touches a
// user's other data — collaboration evidence is community public knowledge.
export async function POST(request: Request): Promise<NextResponse> {
	const user = await getUserFromRequest(request);
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data } = await supabase
		.from('github_connections')
		.select('access_token_encrypted')
		.eq('user_id', user.id)
		.maybeSingle();

	if (data?.access_token_encrypted) {
		try {
			await revokeToken(decryptToken(data.access_token_encrypted));
		} catch (err) {
			// Best-effort: a revocation failure must not block the local disconnect.
			console.error('[github-disconnect] token revocation failed:', err);
		}
	}

	const { error } = await supabase.from('github_connections').delete().eq('user_id', user.id);
	if (error) {
		return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
	}

	return NextResponse.json({ connected: false });
}
