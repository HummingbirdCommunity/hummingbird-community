// GET /api/agent/result?runId=<id> — final result of an investigation.
//
// Reads from the durable `github_investigations` row (the Vercel Workflow run
// is ephemeral). Falls back to the live workflow return value on the brief
// window before the save step has persisted. Ownership-scoped: a caller may
// only read investigations they started.

import { getRun } from 'workflow/api';

import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const runId = searchParams.get('runId');
	if (!runId) {
		return Response.json({ error: 'runId required' }, { status: 400 });
	}

	const { data: row, error } = await supabase
		.from('github_investigations')
		.select('requested_by, status, profile_data, error_message')
		.eq('workflow_run_id', runId)
		.maybeSingle();

	if (error) {
		return Response.json({ error: 'Failed to load investigation' }, { status: 500 });
	}
	if (!row || row.requested_by !== user.id) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	if (row.status === 'completed' && row.profile_data) {
		return Response.json(row.profile_data);
	}
	if (row.status === 'failed') {
		return Response.json({ ok: false, error: row.error_message ?? 'Investigation failed' });
	}

	// Still running (or the save step hasn't landed yet): fall back to the live
	// workflow return value if it's already resolved.
	try {
		const result = await getRun(runId).returnValue;
		return Response.json(result);
	} catch (err) {
		return Response.json({ error: err instanceof Error ? err.message : 'Failed to get result' }, { status: 500 });
	}
}
