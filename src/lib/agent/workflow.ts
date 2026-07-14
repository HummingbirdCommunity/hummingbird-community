// GitHub investigation workflow — orchestrates the agentic tool-calling loop.
// Each progress emit, LLM call, and tool execution is a separate durable step.
// Provider fallback (rate limit / quota) is orchestrated here, not hidden in the LLM client.
// Progress messages use i18n keys — the frontend resolves them via next-intl.

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { DeveloperSummary } from './steps/investigate';
import { getProviders } from './llm';
import {
	callProvider,
	emitProgress,
	executeToolCall,
	saveInvestigationResult,
	SYSTEM_PROMPT,
} from './steps/investigate';

const MAX_TURNS = 10;

export async function investigateGitHubUser(username: string, requesterId: string, investigationId: string) {
	'use workflow';

	try {
		const providers = getProviders();

		const messages: ChatCompletionMessageParam[] = [
			{ role: 'system', content: SYSTEM_PROMPT },
			{ role: 'user', content: `Investigate GitHub user: ${username}` },
		];

		const toolCallLog: Array<{ tool: string; args: Record<string, string> }> = [];
		let profileData: Record<string, unknown> | null = null;

		for (let turn = 0; turn < MAX_TURNS; turn++) {
			let choice;

			for (let pi = 0; pi < providers.length; pi++) {
				const p = providers[pi];

				await emitProgress('synthesis', pi === 0 ? 'asking' : 'switching', {
					vendor: p.displayName,
					model: p.model,
				});

				try {
					const result = await callProvider(p.name, messages);
					choice = result.choice;
					break;
				} catch (err: unknown) {
					// Errors from steps get serialized across the workflow boundary,
					// so instanceof won't work. Check by name or message pattern.
					const errObj = err as { name?: string; status?: number; message?: string };
					const isUnavailable =
						errObj.name === 'ProviderUnavailableError' ||
						(errObj.name === 'FatalError' && /\b(429|402|403)\b/.test(errObj.message ?? ''));

					if (isUnavailable) {
						const status = errObj.status ?? errObj.message?.match(/\b(429|402|403)\b/)?.[1] ?? '?';
						await emitProgress(
							'synthesis',
							'providerUnavailable',
							{
								vendor: p.displayName,
								model: p.model,
								status,
							},
							'warning'
						);
						if (pi === providers.length - 1) {
							throw new Error(`All providers unavailable. Last error: ${errObj.message}`);
						}
						continue;
					}
					throw err;
				}
			}

			if (!choice) throw new Error('No provider returned a response');

			const assistantMsg = choice.message;
			messages.push(assistantMsg);

			if (choice.finish_reason === 'tool_calls' && assistantMsg.tool_calls?.length) {
				for (const tc of assistantMsg.tool_calls) {
					const name = tc.function.name;
					const args = JSON.parse(tc.function.arguments) as Record<string, string>;
					toolCallLog.push({ tool: name, args });

					const toolKey = name === 'get_github_profile' ? 'lookingUpProfile' : 'fetchingRepos';
					await emitProgress('repos', toolKey, { username: args.username });

					const result = await executeToolCall(name, args, requesterId);

					if (name === 'get_github_profile') {
						try {
							const parsed = JSON.parse(result);
							if (!parsed.error) profileData = parsed;
						} catch {
							/* ignore */
						}
					}

					messages.push({
						role: 'tool',
						tool_call_id: tc.id,
						content: result,
					});
				}
			} else {
				const text = assistantMsg.content ?? '';
				const jsonMatch = text.match(/\{[\s\S]*\}/);
				if (!jsonMatch) {
					throw new Error(`LLM did not return valid JSON: ${text.slice(0, 200)}`);
				}

				await emitProgress('synthesis', 'wrappingUp');

				const summary = JSON.parse(jsonMatch[0]) as DeveloperSummary;

				const investigationResult = {
					ok: true,
					username,
					profile: profileData
						? {
								name: profileData.name as string | null,
								bio: profileData.bio as string | null,
								location: profileData.location as string | null,
								followers: profileData.followers as number,
								publicRepos: profileData.public_repos as number,
								avatarUrl: profileData.avatar_url as string,
								url: profileData.html_url as string,
							}
						: null,
					summary,
					toolCalls: toolCallLog,
				};

				await saveInvestigationResult(investigationId, {
					status: 'completed',
					profileData: investigationResult,
				});

				return investigationResult;
			}
		}

		throw new Error('Agent exceeded maximum turns without producing a summary');
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await saveInvestigationResult(investigationId, { status: 'failed', errorMessage: message });
		throw err;
	}
}
