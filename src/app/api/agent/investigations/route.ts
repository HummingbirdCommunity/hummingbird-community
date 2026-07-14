// GET /api/agent/investigations — the caller's recent investigations, newest
// first, for the "Recent investigations" list on the Investigate page.

import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const LIMIT = 20;

export interface InvestigationListItem {
	runId: string | null;
	targetUsername: string;
	status: string;
	createdAt: string;
}

export async function GET(request: Request) {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { data, error } = await supabase
		.from('github_investigations')
		.select('workflow_run_id, target_username, status, created_at')
		.eq('requested_by', user.id)
		.order('created_at', { ascending: false })
		.limit(LIMIT);

	if (error) {
		return Response.json({ error: 'Failed to load investigations' }, { status: 500 });
	}

	const items: InvestigationListItem[] = (data ?? []).map((row) => ({
		runId: row.workflow_run_id,
		targetUsername: row.target_username,
		status: row.status,
		createdAt: row.created_at,
	}));

	return Response.json({ items });
}
