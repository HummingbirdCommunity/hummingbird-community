// GET /api/agent/investigations — the caller's recent investigation runs,
// newest first, for the "Recent investigations" list on the Investigate page.

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
		.from('investigation_runs')
		.select('workflow_run_id, target_login, status, started_at')
		.eq('requested_by', user.id)
		.order('started_at', { ascending: false })
		.limit(LIMIT);

	if (error) {
		return Response.json({ error: 'Failed to load investigations' }, { status: 500 });
	}

	const items: InvestigationListItem[] = (data ?? []).map((row) => ({
		runId: row.workflow_run_id,
		targetUsername: row.target_login,
		status: row.status,
		createdAt: row.started_at,
	}));

	return Response.json({ items });
}
