'use client';

import type { ReactElement } from 'react';
import { AlertTriangle, BookOpen, CheckCircle, Loader2, MapPin, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { InvestigationProgress as ProgressUpdate } from '@/lib/agent/types';

import { supabase } from '@/lib/supabase/client';

interface Props {
	runId: string;
}

interface InvestigationResult {
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
	summary?: {
		headline: string;
		strengths: string[];
		primary_languages: string[];
		notable_repos: string[];
		career_stage: string;
	};
}

export function InvestigationProgress({ runId }: Props): ReactElement {
	const t = useTranslations('investigate.progress');
	const [steps, setSteps] = useState<
		Array<{ key: string; params?: Record<string, string | number>; status?: 'warning' }>
	>([]);
	const [result, setResult] = useState<InvestigationResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [streamDone, setStreamDone] = useState(false);

	// Stream progress updates
	useEffect(() => {
		const controller = new AbortController();

		async function fetchStream() {
			try {
				const res = await fetch(`/api/agent/stream?runId=${runId}`, {
					signal: controller.signal,
				});
				if (!res.ok || !res.body) {
					setError(t('failed'));
					setStreamDone(true);
					return;
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
						try {
							const parsed = JSON.parse(jsonStr) as ProgressUpdate;
							if (parsed.phase && parsed.key) {
								setSteps((prev) => [
									...prev,
									{ key: parsed.key, params: parsed.params, status: parsed.status },
								]);
							}
						} catch {
							// skip
						}
					}
				}
			} catch (err) {
				if (controller.signal.aborted) return;
				setError(t('failed'));
			} finally {
				setStreamDone(true);
			}
		}

		fetchStream();
		return () => controller.abort();
	}, [runId, t]);

	// Fetch final result once stream ends
	useEffect(() => {
		if (!streamDone || error) return;

		async function fetchResult() {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) return;

				const res = await fetch(`/api/agent/result?runId=${runId}`, {
					headers: { Authorization: `Bearer ${session.access_token}` },
				});
				if (res.ok) {
					setResult(await res.json());
				}
			} catch {
				// non-critical
			}
		}

		fetchResult();
	}, [streamDone, runId, error]);

	// A step is "done" only when there's a subsequent step OR the result has loaded.
	// This way the last step keeps spinning until the workflow result is confirmed.
	const allDone = result !== null;

	return (
		<div className="space-y-6">
			{/* Live progress steps */}
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">{t('title')}</h2>
				<div className="space-y-2">
					{steps.map((step, i) => {
						const isLast = i === steps.length - 1;
						const done = isLast ? allDone : true;
						const isWarning = step.status === 'warning';

						return (
							<div key={i} className="flex items-center gap-2 text-sm">
								{isWarning ? (
									<AlertTriangle className="size-4 shrink-0 text-amber-500" />
								) : done ? (
									<CheckCircle className="size-4 shrink-0 text-green-500" />
								) : (
									<Loader2 className="text-primary size-4 shrink-0 animate-spin" />
								)}
								<span
									className={
										isWarning
											? 'text-amber-600 dark:text-amber-400'
											: done
												? 'text-muted-foreground'
												: 'text-foreground font-medium'
									}
								>
									{t(step.key, step.params)}
								</span>
							</div>
						);
					})}

					{/* Show spinner while waiting for first message */}
					{!streamDone && steps.length === 0 && (
						<div className="flex items-center gap-2 text-sm">
							<Loader2 className="text-primary size-4 animate-spin" />
							<span className="text-muted-foreground">{t('connecting')}</span>
						</div>
					)}
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}
			</div>

			{/* Result display */}
			{result && result.ok && result.summary && result.profile && (
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
					<div className="bg-muted rounded-lg p-4 space-y-3">
						<p className="text-sm font-medium">{result.summary.headline}</p>

						<div className="flex flex-wrap gap-1.5">
							<span className="bg-background rounded px-2 py-0.5 text-xs font-medium">
								{result.summary.career_stage}
							</span>
							{result.summary.primary_languages.map((lang) => (
								<span key={lang} className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs">
									{lang}
								</span>
							))}
						</div>

						{result.summary.strengths.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1 text-xs font-medium">Strengths</p>
								<ul className="text-muted-foreground list-inside list-disc text-xs space-y-0.5">
									{result.summary.strengths.map((s) => (
										<li key={s}>{s}</li>
									))}
								</ul>
							</div>
						)}

						{result.summary.notable_repos.length > 0 && (
							<div>
								<p className="text-muted-foreground mb-1 text-xs font-medium">Notable repos</p>
								<div className="flex flex-wrap gap-1.5">
									{result.summary.notable_repos.map((repo) => (
										<span key={repo} className="bg-background rounded px-2 py-0.5 text-xs">
											{repo}
										</span>
									))}
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{result && !result.ok && (
				<div className="border-t pt-4">
					<p className="text-sm text-red-600">
						{result.error === 'not_found' ? `GitHub user "${result.username}" not found.` : t('failed')}
					</p>
				</div>
			)}
		</div>
	);
}
