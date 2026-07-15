// GitHub investigation workflow — orchestrates the agentic tool-calling loop.
// Each progress emit, LLM call, and tool execution is a separate durable step.
// Provider fallback (rate limit / quota) is orchestrated here, not hidden in the
// LLM client. Gathering runs with tools; a final synthesis pass runs with a
// JSON-schema response format so the summary is structured, not hand-parsed.
// Progress messages use i18n keys — the frontend resolves them via next-intl.

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { CapturedToolOutputs } from './evidence';
import type { ProviderInfo } from './llm';
import type { DeveloperSummary } from './types';
import { buildEvidenceSnapshot } from './evidence';
import { getProviders } from './llm';
import { SYNTHESIS_PROMPT } from './prompts';
import {
	callProvider,
	callProviderStructured,
	emitProgress,
	executeToolCall,
	saveRunResult,
	SYSTEM_PROMPT,
	upsertDeveloperProfile,
} from './steps/investigate';
import { developerSummarySchema } from './types';

const MAX_TURNS = 12;

// Observed profiles are cache-fresh for 7 days; the same mark drives the
// non-member hard-delete purge (HB-28). See milestone-3 design §7.
const OBSERVED_FRESH_DAYS = 7;

// Tool name → the evidence-snapshot slot its parsed output feeds (HB-27). Tools
// not listed here (e.g. get_top_repos) don't back a synthesized conclusion, so
// they aren't captured.
const TOOL_EVIDENCE_KEYS: Partial<Record<string, keyof CapturedToolOutputs>> = {
	get_github_profile: 'profile',
	get_contributions: 'contributions',
	get_signature_repos: 'signatureRepos',
	search_cross_repo_prs: 'externalPrs',
};

// Tool name → progress i18n key (resolved by the frontend).
const TOOL_PROGRESS_KEYS: Record<string, string> = {
	get_github_profile: 'lookingUpProfile',
	get_top_repos: 'fetchingRepos',
	get_signature_repos: 'fetchingSignature',
	get_contributions: 'analyzingContributions',
	search_cross_repo_prs: 'searchingContributions',
};

// Errors from steps are serialized across the workflow boundary, so `instanceof`
// won't work — detect provider-unavailable by name or embedded status code.
function classifyError(err: unknown): { unavailable: boolean; status: string; message: string } {
	const e = err as { name?: string; status?: number; message?: string };
	const unavailable =
		e.name === 'ProviderUnavailableError' || (e.name === 'FatalError' && /\b(429|402|403)\b/.test(e.message ?? ''));
	const status = String(e.status ?? e.message?.match(/\b(429|402|403)\b/)?.[1] ?? '?');
	return { unavailable, status, message: e.message ?? String(err) };
}

/** One gathering turn, falling back across providers on rate limit. */
async function runGatheringTurn(providers: ProviderInfo[], messages: ChatCompletionMessageParam[]) {
	for (let pi = 0; pi < providers.length; pi++) {
		const p = providers[pi];
		await emitProgress('synthesis', pi === 0 ? 'asking' : 'switching', { vendor: p.displayName, model: p.model });
		try {
			const { choice } = await callProvider(p.name, messages);
			return choice;
		} catch (err) {
			const { unavailable, status, message } = classifyError(err);
			if (!unavailable) throw err;
			await emitProgress(
				'synthesis',
				'providerUnavailable',
				{ vendor: p.displayName, model: p.model, status },
				'warning'
			);
			if (pi === providers.length - 1) throw new Error(`All providers unavailable. Last error: ${message}`);
		}
	}
	throw new Error('No provider returned a response');
}

/** Final synthesis pass. Falls back across providers on rate limit *and* on
 *  malformed/invalid JSON, so a provider that ignores the schema doesn't sink the
 *  run. Returns a zod-validated summary. */
async function runSynthesis(
	providers: ProviderInfo[],
	messages: ChatCompletionMessageParam[]
): Promise<DeveloperSummary> {
	let lastError = 'unknown error';
	for (let pi = 0; pi < providers.length; pi++) {
		const p = providers[pi];
		await emitProgress('synthesis', 'synthesizing', { vendor: p.displayName, model: p.model });
		try {
			const { content } = await callProviderStructured(p.name, messages);
			const jsonMatch = content.match(/\{[\s\S]*\}/);
			const parsed = developerSummarySchema.safeParse(JSON.parse(jsonMatch ? jsonMatch[0] : content));
			if (parsed.success) return parsed.data;
			lastError = `schema validation failed: ${parsed.error.issues[0]?.message ?? 'invalid shape'}`;
		} catch (err) {
			const { unavailable, status, message } = classifyError(err);
			lastError = message;
			if (unavailable) {
				await emitProgress(
					'synthesis',
					'providerUnavailable',
					{ vendor: p.displayName, model: p.model, status },
					'warning'
				);
			}
		}
		// Any failure (unavailable or bad JSON) → try the next provider.
	}
	throw new Error(`Synthesis failed across all providers. Last error: ${lastError}`);
}

export async function investigateGitHubUser(username: string, requesterId: string, runRowId: string) {
	'use workflow';

	try {
		const providers = getProviders();

		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: `Investigate GitHub user: ${username}` },
		];

		const toolCallLog: Array<{ tool: string; args: Record<string, string> }> = [];
		// Parsed tool outputs synthesis will consume, captured last-wins per tool
		// so the evidence snapshot mirrors the synthesis input exactly (HB-27).
		const captured: CapturedToolOutputs = {};
		let doneGathering = false;

		for (let turn = 0; turn < MAX_TURNS && !doneGathering; turn++) {
			const choice = await runGatheringTurn(providers, messages);
			const assistantMsg = choice.message;
			messages.push(assistantMsg);

			if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
				for (const tc of assistantMsg.tool_calls) {
					const name = tc.function.name;
					const args = JSON.parse(tc.function.arguments) as Record<string, string>;
					toolCallLog.push({ tool: name, args });

					await emitProgress('repos', TOOL_PROGRESS_KEYS[name] ?? 'lookingUpProfile', {
						username: args.username,
					});

					const result = await executeToolCall(name, args, requesterId);

					const evidenceKey = TOOL_EVIDENCE_KEYS[name];
					if (evidenceKey) {
						try {
							captured[evidenceKey] = JSON.parse(result);
						} catch {
							/* leave uncaptured; the assembler treats it as absent */
						}
					}

					messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
				}
			} else {
				doneGathering = true;
			}
		}

		if (!doneGathering) {
			throw new Error('Agent exceeded maximum turns without finishing evidence gathering');
		}

		// Assemble the evidence snapshot from exactly what was gathered, before
		// synthesis runs — it is the auditable record of synthesis's input (HB-27).
		const evidenceSnapshot = buildEvidenceSnapshot(captured);

		// Synthesis: force a schema-valid summary from the gathered evidence.
		messages.push({ role: 'user', content: SYNTHESIS_PROMPT });
		const summary = await runSynthesis(providers, messages);

		const identity = evidenceSnapshot.identity;

		// Every run in this milestone is scenario 2 (analyzing others with the
		// requester's token) → an observed profile of a non-member subject.
		// authored profiles (subject-owned) arrive in HB-29.
		const profileId = await upsertDeveloperProfile({
			githubLogin: username.toLowerCase(),
			source: 'observed',
			subjectUserId: null,
			summary,
			evidenceSnapshot,
			provenance: { profile: identity, tool_calls: toolCallLog },
			freshnessDays: OBSERVED_FRESH_DAYS,
			setPurge: true,
		});

		await saveRunResult(runRowId, { status: 'completed', profileId });

		return { ok: true, username, profile: identity, summary, evidenceSnapshot, toolCalls: toolCallLog };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await saveRunResult(runRowId, { status: 'failed', errorMessage: message });
		throw err;
	}
}
