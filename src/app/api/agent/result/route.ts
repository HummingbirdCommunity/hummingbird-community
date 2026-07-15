// GET /api/agent/result?runId=<id> — final result of an investigation.
//
// Reads the durable investigation_runs row (the Vercel Workflow run is
// ephemeral), then reconstructs the client-facing result from the
// developer_profiles row it produced. Falls back to the live workflow return
// value on the brief window before the profile has been persisted.
// Ownership-scoped: a caller may only read runs they started.

import { getRun } from 'workflow/api';

import type { Provenance } from '@/lib/agent/types';

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

	const { data: run, error } = await supabase
		.from('investigation_runs')
		.select('requested_by, target_login, status, error_message, profile_id')
		.eq('workflow_run_id', runId)
		.maybeSingle();

	if (error) {
		return Response.json({ error: 'Failed to load investigation' }, { status: 500 });
	}
	if (!run || run.requested_by !== user.id) {
		return Response.json({ error: 'Not found' }, { status: 404 });
	}

	if (run.status === 'completed' && run.profile_id) {
		const { data: profile, error: profileError } = await supabase
			.from('developer_profiles')
			.select('summary, evidence_snapshot, provenance')
			.eq('id', run.profile_id)
			.maybeSingle();
		if (profileError || !profile) {
			return Response.json({ error: 'Failed to load investigation' }, { status: 500 });
		}
		const provenance = profile.provenance as Provenance | null;
		return Response.json({
			ok: true,
			username: run.target_login,
			profile: provenance?.profile ?? null,
			summary: profile.summary,
			evidenceSnapshot: profile.evidence_snapshot ?? null,
			toolCalls: provenance?.tool_calls ?? [],
		});
	}
	if (run.status === 'failed') {
		return Response.json({ ok: false, error: run.error_message ?? 'Investigation failed' });
	}

	// Still running (or the profile hasn't landed yet): fall back to the live
	// workflow return value if it's already resolved.
	try {
		const result = await getRun(runId).returnValue;
		return Response.json(result);
	} catch (err) {
		return Response.json({ error: err instanceof Error ? err.message : 'Failed to get result' }, { status: 500 });
	}
}
