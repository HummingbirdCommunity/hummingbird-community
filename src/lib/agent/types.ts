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

/** How a profile's data was sourced (HB-26). Orthogonal to visibility. */
export type ProfileSource = 'authored' | 'observed';

/** Who may read a profile (HB-26). */
export type ProfileVisibility = 'private' | 'public';

/** Status of an investigation run. */
export type InvestigationRunStatus = 'running' | 'completed' | 'failed';

/** The subject's public identity shown on the result card. Lives in
 *  `provenance` so `summary` stays purely analytical. */
export interface ProfileIdentity {
	name: string | null;
	bio: string | null;
	location: string | null;
	followers: number;
	publicRepos: number;
	avatarUrl: string;
	url: string;
}

/** Non-summary record of how a profile was produced — the audit substrate the
 *  result route reconstructs its response from. `evidence_snapshot` (HB-27) is
 *  separate; this holds identity, the tool-call log, and generation metadata. */
export interface Provenance {
	profile: ProfileIdentity | null;
	tool_calls: Array<{ tool: string; args: Record<string, string> }>;
	data_sources?: Record<string, number>;
	agent_model?: string;
}

/** A row in `developer_profiles` (HB-26). */
export interface DeveloperProfileRow {
	id: string;
	github_login: string;
	subject_user_id: string | null;
	source: ProfileSource;
	visibility: ProfileVisibility;
	summary: DeveloperSummary | null;
	evidence_snapshot: unknown;
	provenance: Provenance | null;
	generated_at: string | null;
	fresh_until: string | null;
	purge_after: string | null;
	created_at: string;
	updated_at: string;
}

/** A row in `investigation_runs` (HB-26). */
export interface InvestigationRun {
	id: string;
	profile_id: string | null;
	requested_by: string;
	workflow_run_id: string | null;
	target_login: string;
	status: InvestigationRunStatus;
	started_at: string;
	completed_at: string | null;
	error_message: string | null;
}
