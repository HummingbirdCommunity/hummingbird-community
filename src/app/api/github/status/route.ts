import { NextResponse } from 'next/server';

import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

// Runs on the Node.js runtime — getUserFromRequest uses the server helpers.
export const runtime = 'nodejs';

// Report whether the signed-in user has a GitHub connection. Selects only the
// safe display fields — the token columns never leave the server.
export async function GET(request: Request): Promise<NextResponse> {
	const user = await getUserFromRequest(request);
	if (!user) {
		return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('github_connections')
		.select('github_username, connected_at')
		.eq('user_id', user.id)
		.maybeSingle();
	if (error) {
		return NextResponse.json({ error: 'Failed to load status' }, { status: 500 });
	}

	return NextResponse.json({
		connected: Boolean(data),
		username: data?.github_username ?? null,
		connectedAt: data?.connected_at ?? null,
	});
}
