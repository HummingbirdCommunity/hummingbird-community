'use client';

import type { ReactElement, ReactNode } from 'react';
import { BookOpen, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { EvidenceSnapshot } from '@/lib/agent/evidence';
import type { DeveloperSummary } from '@/lib/agent/types';

import type { EvidenceRow } from './EvidenceHover';
import { EvidenceHover } from './EvidenceHover';

export interface InvestigationResultData {
	ok: boolean;
	username: string;
	error?: string;
	profile?: {
		name: string | null;
		bio: string | null;
		location: string | null;
		followers: number;
		publicRepos: number;
		avatarUrl: string;
		url: string;
	};
	summary?: DeveloperSummary;
	evidenceSnapshot?: EvidenceSnapshot | null;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** claim → evidence-slice selectors (HB-27 "省力档"). Each maps a conclusion to
 *  the snapshot slice it derives from by natural key (language name, owner/repo),
 *  matched case-insensitively. A miss yields empty rows — the hover then reads as
 *  "no structured backing", which is itself a useful signal. */
function languageEvidence(snap: EvidenceSnapshot, name: string, t: Translate): { title?: string; rows: EvidenceRow[] } {
	const key = name.toLowerCase();
	const part = snap.languageParticipation.find((l) => l.language.toLowerCase() === key);
	const rows = snap.topReposByCommits
		.filter((r) => r.primaryLanguage?.toLowerCase() === key)
		.map((r) => ({ label: r.nameWithOwner, value: t('evCommits', { count: r.commits }) }));
	return { title: part ? t('evParticipation', { commits: part.commits, pct: part.percentage }) : undefined, rows };
}

function repoEvidence(snap: EvidenceSnapshot, nameWithOwner: string, t: Translate): { rows: EvidenceRow[] } {
	const key = nameWithOwner.toLowerCase();
	const committed = snap.topReposByCommits.find((r) => r.nameWithOwner.toLowerCase() === key);
	const stars = committed?.stars ?? snap.signatureRepos.find((r) => r.nameWithOwner.toLowerCase() === key)?.stars;
	const rows: EvidenceRow[] = [];
	if (committed) rows.push({ label: t('evUserCommits'), value: committed.commits });
	if (stars != null) rows.push({ label: t('evStars'), value: stars });
	return { rows };
}

function externalEvidence(snap: EvidenceSnapshot, repo: string): { rows: EvidenceRow[] } {
	const key = repo.toLowerCase();
	const rows = snap.externalContributions
		.filter((pr) => pr.repo.toLowerCase() === key)
		.map((pr) => ({ label: pr.title, value: pr.state }));
	return { rows };
}

/** The final investigation result — profile header, AI summary, and evidence
 *  hovers — shared by the live progress page and the inline cache-hit view so
 *  both render a served profile identically. */
export function InvestigationResult({ result }: { result: InvestigationResultData }): ReactElement {
	const t = useTranslations('investigate.progress');

	const snapshot = result.evidenceSnapshot ?? null;
	// Wrap a conclusion in its evidence hover when a snapshot is present; render it
	// bare otherwise (a missing snapshot must not read as "no evidence").
	function withEvidence(node: ReactNode, ev: { title?: string; rows: EvidenceRow[] } | null, focusable = true) {
		if (!ev) return node;
		return (
			<EvidenceHover title={ev.title} rows={ev.rows} empty={t('evidenceEmpty')} focusable={focusable}>
				{node}
			</EvidenceHover>
		);
	}

	return (
		<>
			{result.ok && result.summary && result.profile && (
				<div className="border-t pt-6 space-y-4">
					<p className="text-sm font-medium text-green-600">{t('complete')}</p>

					{/* Profile header */}
					<div className="flex items-start gap-4">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img src={result.profile.avatarUrl} alt={result.username} className="size-16 rounded-full" />
						<div className="space-y-1">
							<h3 className="text-lg font-semibold">
								<a
									href={result.profile.url}
									target="_blank"
									rel="noopener noreferrer"
									className="hover:underline"
								>
									{result.profile.name ?? result.username}
								</a>
							</h3>
							{result.profile.bio && (
								<p className="text-muted-foreground text-sm">{result.profile.bio}</p>
							)}
							<div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
								{result.profile.location && (
									<span className="flex items-center gap-1">
										<MapPin className="size-3" /> {result.profile.location}
									</span>
								)}
								<span className="flex items-center gap-1">
									<Users className="size-3" /> {result.profile.followers} followers
								</span>
								<span className="flex items-center gap-1">
									<BookOpen className="size-3" /> {result.profile.publicRepos} repos
								</span>
							</div>
						</div>
					</div>

					{/* AI Summary */}
					<div className="bg-muted rounded-lg p-4 space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<span className="bg-background rounded px-2 py-0.5 text-xs font-medium capitalize">
								{result.summary.career_stage}
							</span>
							<p className="text-sm font-medium">{result.summary.headline}</p>
						</div>

						{result.summary.strengths.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1 text-xs font-medium">{t('strengths')}</p>
								<ul className="text-muted-foreground list-inside list-disc text-xs space-y-0.5">
									{result.summary.strengths.map((s) => (
										<li key={s}>{s}</li>
									))}
								</ul>
							</div>
						)}

						{result.summary.languages.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('languages')}</p>
								<div className="space-y-1.5">
									{result.summary.languages.map((lang) => (
										<div key={lang.name} className="flex items-baseline gap-2 text-xs">
											{withEvidence(
												<span className="bg-primary/10 text-primary shrink-0 rounded px-2 py-0.5 font-medium">
													{lang.name}
												</span>,
												snapshot ? languageEvidence(snapshot, lang.name, t) : null
											)}
											<span className="text-foreground shrink-0 capitalize">
												{lang.proficiency}
											</span>
											<span className="text-muted-foreground">— {lang.evidence}</span>
										</div>
									))}
								</div>
							</div>
						)}

						{result.summary.domains.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('domains')}</p>
								<div className="flex flex-wrap gap-1.5">
									{result.summary.domains.map((d) => (
										<span
											key={d.name}
											title={d.evidence}
											className="bg-background rounded px-2 py-0.5 text-xs"
										>
											{d.name} · <span className="text-muted-foreground">{d.depth}</span>
										</span>
									))}
								</div>
							</div>
						)}

						{result.summary.notable_repos.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1.5 text-xs font-medium">{t('notableRepos')}</p>
								<ul className="space-y-1">
									{result.summary.notable_repos.map((repo) => (
										<li key={repo.name_with_owner} className="text-xs">
											{withEvidence(
												<a
													href={repo.url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary font-medium hover:underline"
												>
													{repo.name_with_owner}
												</a>,
												snapshot ? repoEvidence(snapshot, repo.name_with_owner, t) : null,
												false
											)}{' '}
											<span className="text-muted-foreground">
												★{repo.stars} · {repo.role} — {repo.reason}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						{result.summary.external_contributions.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1.5 text-xs font-medium">
									{t('externalContributions')}
								</p>
								<ul className="space-y-1">
									{result.summary.external_contributions.map((c) => (
										<li key={c.url} className="text-xs">
											{withEvidence(
												<a
													href={c.url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-primary font-medium hover:underline"
												>
													{c.repo}
												</a>,
												snapshot ? externalEvidence(snapshot, c.repo) : null,
												false
											)}{' '}
											<span className="text-muted-foreground">— {c.description}</span>
										</li>
									))}
								</ul>
							</div>
						)}

						{result.summary.data_quality_notes.length > 0 && (
							<div className="border-t pt-3">
								<p className="text-muted-foreground mb-1 text-xs font-medium">{t('dataQuality')}</p>
								<ul className="text-muted-foreground list-inside list-disc text-xs space-y-0.5">
									{result.summary.data_quality_notes.map((n) => (
										<li key={n}>{n}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</div>
			)}

			{!result.ok && (
				<div className="border-t pt-4">
					<p className="text-sm text-red-600">
						{result.error === 'not_found' ? `GitHub user "${result.username}" not found.` : t('failed')}
					</p>
				</div>
			)}
		</>
	);
}
