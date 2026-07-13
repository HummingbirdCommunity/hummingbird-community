// GET /api/agent/result?runId=<id> — get the final result of a workflow run.

import { getRun } from 'workflow/api';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const runId = searchParams.get('runId');

	if (!runId) {
		return Response.json({ error: 'runId required' }, { status: 400 });
	}

	try {
		const run = getRun(runId);
		const result = await run.returnValue;
		return Response.json(result);
	} catch (err) {
		return Response.json(
			{ error: err instanceof Error ? err.message : 'Failed to get result' },
			{ status: 500 },
		);
	}
}
