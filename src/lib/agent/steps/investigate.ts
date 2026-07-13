// Step: agentic investigation — Gemini decides which GitHub tools to call,
// we execute them and feed results back, repeating until Gemini produces
// a final summary. Validates the full tool-calling loop.

import { getWritable } from 'workflow';

import type { InvestigationProgress } from '../types';
import { getGeminiClient } from '../gemini';
import { USER_AGENT, REQUEST_TIMEOUT_MS } from '@/lib/github/http';
import type { FunctionCallingConfigMode, FunctionDeclaration, Part, Type } from '@google/genai';

export interface DeveloperSummary {
	headline: string;
	strengths: string[];
	primary_languages: string[];
	notable_repos: string[];
	career_stage: string;
}

// -- Tool definitions for Gemini function calling --

const toolDeclarations: FunctionDeclaration[] = [
	{
		name: 'get_github_profile',
		description:
			"Get a GitHub user's public profile including name, bio, company, location, follower count, public repo count, and account creation date.",
		parameters: {
			type: 'OBJECT' as Type,
			properties: {
				username: { type: 'STRING' as Type, description: 'GitHub username' },
			},
			required: ['username'],
		},
	},
	{
		name: 'get_top_repos',
		description:
			"Get a GitHub user's top public repositories sorted by stars (up to 10). Returns repo name, description, primary language, star count, fork count, and topics.",
		parameters: {
			type: 'OBJECT' as Type,
			properties: {
				username: { type: 'STRING' as Type, description: 'GitHub username' },
			},
			required: ['username'],
		},
	},
];

// -- Tool execution --

async function executeTool(name: string, args: Record<string, string>): Promise<unknown> {
	switch (name) {
		case 'get_github_profile': {
			const res = await fetch(
				`https://api.github.com/users/${encodeURIComponent(args.username)}`,
				{
					headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				},
			);
			if (res.status === 404) return { error: 'User not found' };
			if (!res.ok) return { error: `GitHub API error: ${res.status}` };
			const data = await res.json();
			return {
				login: data.login,
				name: data.name,
				bio: data.bio,
				company: data.company,
				location: data.location,
				blog: data.blog,
				public_repos: data.public_repos,
				followers: data.followers,
				following: data.following,
				created_at: data.created_at,
				avatar_url: data.avatar_url,
				html_url: data.html_url,
			};
		}
		case 'get_top_repos': {
			const res = await fetch(
				`https://api.github.com/users/${encodeURIComponent(args.username)}/repos?sort=stars&per_page=10&type=owner`,
				{
					headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				},
			);
			if (!res.ok) return { error: `GitHub API error: ${res.status}` };
			const repos = await res.json();
			return (repos as Array<Record<string, unknown>>).map((r) => ({
				name: r.name,
				full_name: r.full_name,
				description: r.description,
				language: r.language,
				stargazers_count: r.stargazers_count,
				forks_count: r.forks_count,
				topics: r.topics,
				html_url: r.html_url,
			}));
		}
		default:
			return { error: `Unknown tool: ${name}` };
	}
}

// -- Main agentic step --

const SYSTEM_PROMPT = `You are a developer research agent. Given a GitHub username, use the available tools to investigate the developer, then produce a JSON summary.

Instructions:
1. First call get_github_profile to get the user's profile
2. Then call get_top_repos to see their repositories
3. Based on the data, produce your final response as a JSON object with this structure:
{
  "headline": "A one-sentence summary of this developer",
  "strengths": ["strength1", "strength2", "strength3"],
  "primary_languages": ["lang1", "lang2"],
  "notable_repos": ["repo1", "repo2"],
  "career_stage": "junior | mid-level | senior | staff | distinguished"
}

Always call the tools first before producing your summary. Respond with ONLY the JSON object as your final answer (no markdown fences).`;

const MAX_TURNS = 6;

export async function investigateWithTools(username: string): Promise<{
	summary: DeveloperSummary;
	toolCalls: Array<{ tool: string; args: Record<string, string> }>;
	profile: Record<string, unknown> | null;
}> {
	'use step';

	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase: 'synthesis', message: `Agent starting investigation of ${username}...` });
	} finally {
		writer.releaseLock();
	}

	const ai = getGeminiClient();
	const toolCallLog: Array<{ tool: string; args: Record<string, string> }> = [];
	let profileData: Record<string, unknown> | null = null;

	// Use the SDK's chat API — it handles thoughtSignature automatically
	const chat = ai.chats.create({
		model: 'gemini-3.5-flash',
		config: {
			systemInstruction: SYSTEM_PROMPT,
			tools: [{ functionDeclarations: toolDeclarations }],
			toolConfig: {
				functionCallingConfig: {
					mode: 'AUTO' as FunctionCallingConfigMode,
				},
			},
		},
	});

	let response = await chat.sendMessage({
		message: `Investigate GitHub user: ${username}`,
	});

	for (let turn = 0; turn < MAX_TURNS; turn++) {
		const parts: Part[] = response.candidates?.[0]?.content?.parts ?? [];
		const functionCalls = parts.filter((p) => p.functionCall);

		if (functionCalls.length === 0) {
			// No more tool calls — extract the final text response
			const textPart = parts.find((p) => p.text);
			if (!textPart?.text) {
				throw new Error('Gemini returned neither text nor tool calls');
			}

			const text = textPart.text;
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) throw new Error(`Gemini did not return valid JSON: ${text.slice(0, 200)}`);

			const w2 = getWritable<InvestigationProgress>().getWriter();
			try {
				await w2.write({ phase: 'synthesis', message: 'AI synthesis complete' });
			} finally {
				w2.releaseLock();
			}

			return {
				summary: JSON.parse(jsonMatch[0]) as DeveloperSummary,
				toolCalls: toolCallLog,
				profile: profileData,
			};
		}

		// Execute tool calls and send results back
		const functionResponses: Part[] = [];
		for (const part of functionCalls) {
			const fc = part.functionCall!;
			const name = fc.name!;
			const args = (fc.args ?? {}) as Record<string, string>;
			toolCallLog.push({ tool: name, args });

			// Emit progress
			const w3 = getWritable<InvestigationProgress>().getWriter();
			try {
				const phase = name === 'get_github_profile' ? 'profile' as const : 'repos' as const;
				await w3.write({
					phase,
					message: `Tool call: ${name}(${JSON.stringify(args)})`,
				});
			} finally {
				w3.releaseLock();
			}

			const result = await executeTool(name, args);

			if (name === 'get_github_profile' && result && typeof result === 'object' && !('error' in (result as Record<string, unknown>))) {
				profileData = result as Record<string, unknown>;
			}

			// Gemini requires functionResponse.response to be an object, not an array.
			const wrappedResult = Array.isArray(result) ? { items: result } : result;

			functionResponses.push({
				functionResponse: {
					name,
					response: wrappedResult as Record<string, unknown>,
				},
			});
		}

		// Send function results back — the chat API preserves thoughtSignature
		response = await chat.sendMessage({ message: functionResponses });
	}

	throw new Error('Agent exceeded maximum turns without producing a summary');
}
