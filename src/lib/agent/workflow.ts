// GitHub investigation workflow — orchestrates the agentic investigation.
// Phase 0: validates the full loop — Gemini calls GitHub tools, gets results,
// produces a developer summary.

import { getWritable } from 'workflow';

import type { InvestigationProgress } from './types';
import { investigateWithTools } from './steps/investigate';

async function emitProgress(phase: InvestigationProgress['phase'], message: string) {
	'use step';
	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase, message });
	} finally {
		writer.releaseLock();
	}
}

/**
 * Investigate a GitHub user using an agentic tool-calling loop:
 * Gemini decides which GitHub tools to call → we execute → feed results back → repeat.
 */
export async function investigateGitHubUser(username: string) {
	'use workflow';

	await emitProgress('profile', `Starting agentic investigation for ${username}...`);

	const { summary, toolCalls, profile } = await investigateWithTools(username);

	await emitProgress('saving', `Investigation complete — ${toolCalls.length} tool calls made`);

	return {
		ok: true,
		username,
		profile: profile
			? {
					name: profile.name as string | null,
					bio: profile.bio as string | null,
					location: profile.location as string | null,
					followers: profile.followers as number,
					publicRepos: profile.public_repos as number,
					avatarUrl: profile.avatar_url as string,
					url: profile.html_url as string,
				}
			: null,
		summary,
		toolCalls,
	};
}
