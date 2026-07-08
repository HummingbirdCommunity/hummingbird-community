'use client';

import type { ReactElement } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { GitFork, Github, Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { SignatureRepo } from '@/lib/github/signature';

import { useImpersonation } from '@/components/ImpersonationProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSignatureRepos, startConnect } from '@/lib/github/client';

function RepoRow({ repo }: { repo: SignatureRepo }): ReactElement {
	const t = useTranslations('github.signature');
	const format = useFormatter();

	return (
		<li className="flex flex-col gap-1 border-b py-3 last:border-b-0">
			<div className="flex min-w-0 items-center gap-2">
				<a href={repo.url} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline">
					{/* Own repos show just the name; a pinned org/other-user repo shows
					    owner/name so its provenance is clear. */}
					{repo.ownedByUser ? repo.name : repo.nameWithOwner}
				</a>
				{repo.isFork && (
					<span className="text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-xs">
						{t('fork')}
					</span>
				)}
			</div>
			{repo.description && <p className="text-muted-foreground text-sm">{repo.description}</p>}
			<div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
				{repo.language && <span>{repo.language}</span>}
				<span className="flex items-center gap-1" aria-label={t('stars', { count: repo.stars })}>
					<Star className="size-3" aria-hidden />
					{format.number(repo.stars)}
				</span>
				<span className="flex items-center gap-1" aria-label={t('forks', { count: repo.forks })}>
					<GitFork className="size-3" aria-hidden />
					{format.number(repo.forks)}
				</span>
			</div>
		</li>
	);
}

function RepoList({
	repos,
	computedAt,
	stale,
	disconnected,
}: {
	repos: SignatureRepo[];
	computedAt: string;
	stale: boolean;
	disconnected: boolean;
}): ReactElement {
	const t = useTranslations('github.signature');
	const format = useFormatter();

	if (repos.length === 0) {
		return <span className="text-muted-foreground text-sm">{t('empty')}</span>;
	}

	// A frozen snapshot (disconnected) or a failed refresh (stale) is worth
	// flagging next to when the data was last computed.
	const note = disconnected ? t('paused') : stale ? t('stale') : null;

	return (
		<div className="space-y-3">
			<ul>
				{repos.map((repo) => (
					<RepoRow key={repo.nameWithOwner} repo={repo} />
				))}
			</ul>
			<p className="text-muted-foreground text-xs">
				{t('lastUpdated', { date: format.dateTime(new Date(computedAt), { dateStyle: 'medium' }) })}
				{note ? ` · ${note}` : ''}
			</p>
		</div>
	);
}

export function SignatureRepos(): ReactElement | null {
	const t = useTranslations('github.signature');
	const tCommon = useTranslations('common');
	const { impersonatedUserId } = useImpersonation();

	const { data, isPending } = useQuery({
		queryKey: ['github-signature', impersonatedUserId],
		queryFn: getSignatureRepos,
	});
	const reconnect = useMutation({ mutationFn: startConnect, onError: () => toast.error(t('error')) });

	// Nothing to show for a user who has never connected — the connection card
	// owns that state. Snapshots survive disconnect, so those still render.
	if (!isPending && (!data || data.status === 'no-data')) return null;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Github className="h-5 w-5" />
					{t('title')}
				</CardTitle>
				<CardDescription>{t('subtitle')}</CardDescription>
			</CardHeader>
			<CardContent>
				{isPending || !data ? (
					<span className="text-muted-foreground text-sm">{tCommon('loading')}</span>
				) : data.status === 'needs-reauth' ? (
					<div className="space-y-3">
						<p className="text-muted-foreground text-sm">{t('needsReauth')}</p>
						<Button onClick={() => reconnect.mutate()} disabled={reconnect.isPending}>
							<Github className="h-4 w-4" />
							{t('reconnect')}
						</Button>
					</div>
				) : data.status === 'rate-limited' ? (
					<span className="text-muted-foreground text-sm">{t('rateLimited')}</span>
				) : data.status === 'ok' ? (
					<RepoList
						repos={data.repos}
						computedAt={data.computedAt}
						stale={data.stale}
						disconnected={data.disconnected}
					/>
				) : (
					<span className="text-muted-foreground text-sm">{t('error')}</span>
				)}
			</CardContent>
		</Card>
	);
}
