// GET /api/agent/stream?runId=<id> — stream investigation progress to the client.

import { getRun } from 'workflow/api';

import type { InvestigationProgress } from '@/lib/agent/types';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const runId = searchParams.get('runId');

	if (!runId) {
		return Response.json({ error: 'runId required' }, { status: 400 });
	}

	const run = getRun(runId);
	const readable = run.getReadable<InvestigationProgress>();

	// Transform the object stream into newline-delimited JSON text so the
	// Response can write it — Next.js requires string/Buffer chunks.
	const textStream = readable.pipeThrough(
		new TransformStream<InvestigationProgress, string>({
			transform(chunk, controller) {
				controller.enqueue(JSON.stringify(chunk) + '\n');
			},
		}),
	);

	return new Response(textStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
		},
	});
}
