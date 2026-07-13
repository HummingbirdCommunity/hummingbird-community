// TypeScript types for the GitHub investigation agent.

/** Progress update emitted to the streaming client during an investigation. */
export interface InvestigationProgress {
	phase: 'profile' | 'repos' | 'contributions' | 'cross-repo' | 'synthesis' | 'saving';
	message: string;
}

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
