// Step: call Gemini to produce a brief developer summary from GitHub data.
// Phase 0 validation — proves the LLM integration works end-to-end.

import { getWritable } from 'workflow';

import type { InvestigationProgress } from '../types';
import { getGeminiClient } from '../gemini';
import type { GitHubProfile } from './fetch-profile';
import type { GitHubRepo } from './fetch-repos';

export interface DeveloperSummary {
	headline: string;
	strengths: string[];
	primary_languages: string[];
	notable_repos: string[];
	career_stage: string;
}

export async function summarizeWithGemini(
	profile: GitHubProfile,
	repos: GitHubRepo[],
): Promise<DeveloperSummary> {
	'use step';

	const writer = getWritable<InvestigationProgress>().getWriter();
	try {
		await writer.write({ phase: 'synthesis', message: `Running AI synthesis for ${profile.login}...` });
	} finally {
		writer.releaseLock();
	}

	const repoSummary = repos
		.map((r) => `- ${r.name}: ${r.description ?? '(no description)'} [${r.language ?? 'unknown'}] ${r.stargazers_count} stars`)
		.join('\n');

	const prompt = `Analyze this GitHub developer and produce a brief profile summary.

## GitHub Profile
- Username: ${profile.login}
- Name: ${profile.name ?? 'N/A'}
- Bio: ${profile.bio ?? 'N/A'}
- Company: ${profile.company ?? 'N/A'}
- Location: ${profile.location ?? 'N/A'}
- Public repos: ${profile.public_repos}
- Followers: ${profile.followers}
- Following: ${profile.following}
- Member since: ${profile.created_at}

## Top Repositories (by stars)
${repoSummary || '(no public repositories)'}

Respond in JSON with this exact structure:
{
  "headline": "A one-sentence summary of this developer",
  "strengths": ["strength1", "strength2", "strength3"],
  "primary_languages": ["lang1", "lang2"],
  "notable_repos": ["repo1", "repo2"],
  "career_stage": "junior | mid-level | senior | staff | distinguished"
}`;

	const ai = getGeminiClient();
	const response = await ai.models.generateContent({
		model: 'gemini-3.5-flash',
		contents: prompt,
	});

	// Extract JSON from the response — Gemini may wrap it in ```json fences.
	const text = response.text ?? '';
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	if (!jsonMatch) throw new Error('Gemini did not return valid JSON');
	return JSON.parse(jsonMatch[0]) as DeveloperSummary;
}
