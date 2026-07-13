// POST /api/agent/investigate — start a GitHub user investigation workflow.

import { start } from 'workflow/api';

import { investigateGitHubUser } from '@/lib/agent/workflow';
import { getUserFromRequest } from '@/lib/github/session';

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

	const run = await start(investigateGitHubUser, [username]);

	return Response.json({
		runId: run.runId,
		status: 'started',
	});
}
