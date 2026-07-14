// LLM prompts and the structured-output JSON schema for the investigation agent.
//
// Two phases share this file:
//   1. Gathering loop — SYSTEM_PROMPT drives tool-calling to collect evidence.
//   2. Synthesis — SYNTHESIS_PROMPT + SUMMARY_JSON_SCHEMA force a schema-valid
//      DeveloperSummary via the provider's response_format, so we never hand-parse
//      free-form model text.

/** Drives the tool-calling gathering loop. */
export const SYSTEM_PROMPT = `You are a developer research agent. Given a GitHub username, use the available tools to gather evidence about the developer, then hand off to synthesis.

Gather in roughly this order, skipping tools that clearly won't add signal:
1. get_github_profile — identity, tenure, follower reach.
2. get_signature_repos — pinned and top-starred repos (what they want to be known for).
3. get_contributions — commit/PR/issue activity and, crucially, language usage weighted by how many commits the user actually made (not repo size). Trust this over raw repo languages when judging proficiency.
4. search_cross_repo_prs — pull requests the user opened in repos they don't own (external / open-source contributions).

Judge depth, not just presence: distinguish "committed once to a big C repo" from "maintains a Python framework". Weigh commit participation, ownership/role, project stars, and how many years they've been active.

When you have enough evidence, stop calling tools and reply with a short plain-text note that you are ready to summarize (no JSON). The system will then ask you for the structured summary separately.`;

/** Sent as a final user turn to elicit the structured summary. */
export const SYNTHESIS_PROMPT = `Based on all the evidence gathered above, produce the final developer summary as JSON matching the required schema.

Rules:
- Base language proficiency primarily on commit participation and years active, not on which languages merely appear in repos.
- Every notable_repos entry must use a real nameWithOwner and its actual GitHub URL (https://github.com/<owner>/<repo>) as evidence.
- external_contributions must come from pull requests to repos the user does NOT own; use the real PR URL.
- If evidence is thin (new account, few contributions, mostly forks), say so in data_quality_notes rather than overstating.
- Keep arrays concise: at most 5 languages, 4 domains, 6 notable_repos, 6 external_contributions.`;

/**
 * JSON Schema for the DeveloperSummary structured output. Kept deliberately
 * parallel to the zod schema in types.ts (which validates the parsed result).
 * `strict: true` is honored by providers that support it; others still receive
 * the shape as guidance.
 */
export const SUMMARY_JSON_SCHEMA: Record<string, unknown> = {
	type: 'object',
	additionalProperties: false,
	required: [
		'headline',
		'career_stage',
		'strengths',
		'languages',
		'domains',
		'notable_repos',
		'external_contributions',
		'data_quality_notes',
	],
	properties: {
		headline: { type: 'string', description: 'One-sentence summary of the developer.' },
		career_stage: {
			type: 'string',
			enum: ['junior', 'mid-level', 'senior', 'staff', 'distinguished'],
		},
		strengths: { type: 'array', items: { type: 'string' } },
		languages: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['name', 'proficiency', 'evidence'],
				properties: {
					name: { type: 'string' },
					proficiency: { type: 'string', enum: ['beginner', 'familiar', 'proficient', 'expert'] },
					evidence: {
						type: 'string',
						description: 'Why this level — cite commit participation, years, role.',
					},
				},
			},
		},
		domains: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['name', 'depth', 'evidence'],
				properties: {
					name: { type: 'string' },
					depth: {
						type: 'string',
						enum: ['exposure', 'working-knowledge', 'deep', 'expert', 'world-class'],
					},
					evidence: { type: 'string' },
				},
			},
		},
		notable_repos: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['name_with_owner', 'role', 'stars', 'url', 'reason'],
				properties: {
					name_with_owner: { type: 'string' },
					role: {
						type: 'string',
						enum: ['creator-maintainer', 'core-contributor', 'contributor', 'occasional-contributor'],
					},
					stars: { type: 'number' },
					url: { type: 'string' },
					reason: { type: 'string' },
				},
			},
		},
		external_contributions: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['repo', 'url', 'description'],
				properties: {
					repo: { type: 'string' },
					url: { type: 'string' },
					description: { type: 'string' },
				},
			},
		},
		data_quality_notes: { type: 'array', items: { type: 'string' } },
	},
};
