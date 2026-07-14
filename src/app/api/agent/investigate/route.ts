// POST /api/agent/investigate — start a GitHub user investigation workflow.

import { start } from 'workflow/api';

import { investigateGitHubUser } from '@/lib/agent/workflow';
import { getUserFromRequest } from '@/lib/github/session';
import { supabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
	const user = await getUserFromRequest(request);
	if (!user) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as { username?: string };
	const username = body.username?.trim();
	if (!username) {
		return Response.json({ error: 'Username required' }, { status: 400 });
	}

	// Create the audit-trail run row up front so the workflow has a durable home
	// to report into. Keyed by this id, not the run id, so the save never
	// depends on the run id being stamped back first.
	const { data: row, error: insertError } = await supabase
		.from('investigation_runs')
		.insert({ target_login: username, requested_by: user.id, status: 'running' })
		.select('id')
		.single();

	if (insertError || !row) {
		console.error('[agent] failed to create investigation run row:', insertError);
		return Response.json({ error: 'Failed to start investigation' }, { status: 500 });
	}

	const run = await start(investigateGitHubUser, [username, user.id, row.id]);

	// Stamp the run id so the result/stream routes can find this row by it.
	const { error: updateError } = await supabase
		.from('investigation_runs')
		.update({ workflow_run_id: run.runId })
		.eq('id', row.id);
	if (updateError) {
		console.error('[agent] failed to stamp workflow run id:', updateError);
	}

	return Response.json({
		runId: run.runId,
		status: 'started',
	});
}
