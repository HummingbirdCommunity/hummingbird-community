// TypeScript types for the GitHub investigation agent.

import { z } from 'zod';

/** Progress update emitted to the streaming client during an investigation.
 *  `key` is an i18n message key; `params` are interpolation values.
 *  The frontend resolves them via next-intl. */
export interface InvestigationProgress {
	phase: 'profile' | 'repos' | 'contributions' | 'cross-repo' | 'synthesis' | 'saving';
	key: string;
	params?: Record<string, string | number>;
	status?: 'warning';
}

/** Runtime validator for the LLM's structured summary. Kept parallel to
 *  SUMMARY_JSON_SCHEMA in prompts.ts — the schema constrains generation, this
 *  guards against a provider that ignores it. */
export const developerSummarySchema = z.object({
	headline: z.string(),
	career_stage: z.enum(['junior', 'mid-level', 'senior', 'staff', 'distinguished']),
	strengths: z.array(z.string()),
	languages: z.array(
		z.object({
			name: z.string(),
			proficiency: z.enum(['beginner', 'familiar', 'proficient', 'expert']),
			evidence: z.string(),
		})
	),
	domains: z.array(
		z.object({
			name: z.string(),
			depth: z.enum(['exposure', 'working-knowledge', 'deep', 'expert', 'world-class']),
			evidence: z.string(),
		})
	),
	notable_repos: z.array(
		z.object({
			name_with_owner: z.string(),
			role: z.enum(['creator-maintainer', 'core-contributor', 'contributor', 'occasional-contributor']),
			stars: z.number(),
			url: z.string(),
			reason: z.string(),
		})
	),
	external_contributions: z.array(
		z.object({
			repo: z.string(),
			url: z.string(),
			description: z.string(),
		})
	),
	data_quality_notes: z.array(z.string()),
});

/** The synthesized, evidence-backed developer summary (Phase 2 rich schema). */
export type DeveloperSummary = z.infer<typeof developerSummarySchema>;

/** Raw profile data collected from GitHub's GraphQL API (Phase 1). */
export interface RawProfile {
	username: string;
	name: string | null;
	bio: string | null;
	company: string | null;
	location: string | null;
	email: string | null;
	isHireable: boolean;
	website: string | null;
	twitter: string | null;
	createdAt: string;
	socialAccounts: Array<{ provider: string; url: string }>;
	followersCount: number;
	followingCount: number;
	organizations: Array<{ login: string; name: string | null }>;
	pinnedItems: Array<{
		nameWithOwner: string;
		description: string | null;
		stargazerCount: number;
		primaryLanguage: { name: string } | null;
	}>;
	publicReposCount: number;
	contributionYears: number[];
	badges: string[];
}

/** Final synthesized developer profile output from the AI step (Phase 5). */
export interface DeveloperProfile {
	identity: {
		github_username: string;
		display_name: string | null;
		bio: string | null;
		location: string | null;
		member_since: string;
		organizations: string[];
	};
	technical_skills: {
		primary_languages: Array<{ name: string; proficiency: string }>;
		frameworks_and_tools: string[];
		domains: string[];
	};
	ai_summary: {
		headline: string;
		strengths: string[];
		career_trajectory: string;
		collaboration_style: string;
	};
	activity_metrics: {
		total_public_repos: number;
		total_stars_received: number;
		contribution_streak_years: number;
		notable_contributions: string[];
	};
	confidence_score: number;
	generated_at: string;
}

/** Status of an investigation run. */
export type InvestigationStatus = 'pending' | 'running' | 'completed' | 'failed';
