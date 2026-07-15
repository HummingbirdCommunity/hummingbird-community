// Evidence snapshot — the structured tool outputs synthesis actually consumed,
// captured so every conclusion stays auditable (HB-27, milestone-3 design §8).
//
// The snapshot is *not* LLM output: it is assembled from the same tool results
// that were fed to synthesis, so a plain TypeScript shape (no zod guard) is
// enough. Keeping it identical to the synthesis input is the invariant the
// hover audit relies on — a claim can be traced to a slice only if the data it
// derives from lives here. buildEvidenceSnapshot is defensive: tool calls that
// errored or returned an unexpected shape collapse to empty/null rather than
// throwing, so a partial gather still yields a usable snapshot.

import type { SignatureRepo } from '@/lib/github/signature';

import type { ContributionSummary, LanguageParticipation, RepoCommitCount } from './contributions';
import type { ProfileIdentity } from './types';

/** A pull request the subject opened in a repo they do not own. */
export interface ExternalContribution {
	repo: string;
	title: string;
	url: string;
	state: string;
}

/** The synthesis-input snapshot persisted on developer_profiles.evidence_snapshot. */
export interface EvidenceSnapshot {
	identity: ProfileIdentity | null;
	contributionTotals: ContributionSummary['totals'] | null;
	activeYears: number[];
	languageParticipation: LanguageParticipation[];
	topReposByCommits: RepoCommitCount[];
	signatureRepos: SignatureRepo[];
	externalContributions: ExternalContribution[];
}

/** The raw (parsed) tool outputs captured during gathering, last-wins per tool.
 *  Each is `unknown` because a tool call may have returned an `{ error }` object
 *  or nothing at all. */
export interface CapturedToolOutputs {
	profile?: unknown;
	contributions?: unknown;
	signatureRepos?: unknown;
	externalPrs?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/** A tool result is usable only when it's an object without an `error` field. */
function ok(value: unknown): value is Record<string, unknown> {
	return isRecord(value) && !('error' in value);
}

function identityFromProfile(profile: unknown): ProfileIdentity | null {
	if (!ok(profile)) return null;
	return {
		name: (profile.name as string | null) ?? null,
		bio: (profile.bio as string | null) ?? null,
		location: (profile.location as string | null) ?? null,
		followers: (profile.followers as number) ?? 0,
		publicRepos: (profile.public_repos as number) ?? 0,
		avatarUrl: (profile.avatar_url as string) ?? '',
		url: (profile.html_url as string) ?? '',
	};
}

/** Assemble the snapshot from captured tool outputs. Pure — unit-testable in
 *  isolation from the workflow. */
export function buildEvidenceSnapshot(captured: CapturedToolOutputs): EvidenceSnapshot {
	const contributions = ok(captured.contributions)
		? (captured.contributions as unknown as ContributionSummary)
		: null;
	const signatureRepos = Array.isArray(captured.signatureRepos) ? (captured.signatureRepos as SignatureRepo[]) : [];
	const externalContributions = Array.isArray(captured.externalPrs)
		? (captured.externalPrs as ExternalContribution[])
		: [];

	return {
		identity: identityFromProfile(captured.profile),
		contributionTotals: contributions?.totals ?? null,
		activeYears: contributions?.activeYears ?? [],
		languageParticipation: contributions?.languageParticipation ?? [],
		topReposByCommits: contributions?.topReposByCommits ?? [],
		signatureRepos,
		externalContributions,
	};
}
