'use client';

import type { ReactElement } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Github } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useImpersonation } from '@/components/ImpersonationProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getLanguages, startConnect } from '@/lib/github/client';

// Categorical hues in fixed order, drawn from the brand accents; a language
// keeps the color for its rank and everything past the palette folds into
// "Other". These brand hues are near-analogous (weak CVD separation), so
// identity is carried by the always-visible legend labels — name + percent —
// never by color alone.
const SEGMENT_COLORS = ['var(--teal)', 'var(--lime)', 'var(--mint)', 'var(--ink-navy)', 'var(--sky-teal)'];
const OTHER_COLOR = 'var(--muted-foreground)';

interface Segment {
	name: string;
	percent: number;
	color: string;
}

// Rank languages by byte count, keep the top few as their own segments, and sum
// the remainder into a single "Other" slice.
function toSegments(languages: Record<string, number>, otherLabel: string): Segment[] {
	const total = Object.values(languages).reduce((sum, bytes) => sum + bytes, 0);
	if (total === 0) return [];

	const ranked = Object.entries(languages).sort(([, a], [, b]) => b - a);
	const segments = ranked.slice(0, SEGMENT_COLORS.length).map(([name, bytes], index) => ({
		name,
		percent: (bytes / total) * 100,
		color: SEGMENT_COLORS[index],
	}));

	const restBytes = ranked.slice(SEGMENT_COLORS.length).reduce((sum, [, bytes]) => sum + bytes, 0);
	if (restBytes > 0) {
		segments.push({ name: otherLabel, percent: (restBytes / total) * 100, color: OTHER_COLOR });
	}
	return segments;
}

function LanguageChart({
	languages,
	repoCount,
	computedAt,
	stale,
	disconnected,
}: {
	languages: Record<string, number>;
	repoCount: number;
	computedAt: string;
	stale: boolean;
	disconnected: boolean;
}): ReactElement {
	const t = useTranslations('github.languages');
	const format = useFormatter();
	const segments = toSegments(languages, t('other'));

	if (segments.length === 0) {
		return <span className="text-muted-foreground text-sm">{t('empty')}</span>;
	}

	// A frozen snapshot (disconnected) or a failed refresh (stale) is worth
	// flagging next to when the data was last computed.
	const note = disconnected ? t('paused') : stale ? t('stale') : null;

	return (
		<div className="space-y-3">
			<div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={t('title')}>
				{segments.map((segment) => (
					<div
						key={segment.name}
						className="h-full rounded-full"
						style={{ width: `${segment.percent}%`, backgroundColor: segment.color }}
					/>
				))}
			</div>
			<ul className="flex flex-wrap gap-x-4 gap-y-1.5">
				{segments.map((segment) => (
					<li key={segment.name} className="flex items-center gap-1.5 text-sm">
						<span
							className="size-2.5 rounded-full"
							style={{ backgroundColor: segment.color }}
							aria-hidden
						/>
						<span className="font-medium">{segment.name}</span>
						<span className="text-muted-foreground">{segment.percent.toFixed(1)}%</span>
					</li>
				))}
			</ul>
			<p className="text-muted-foreground text-xs">
				{t('repoCount', { count: repoCount })} ·{' '}
				{t('lastUpdated', { date: format.dateTime(new Date(computedAt), { dateStyle: 'medium' }) })}
				{note ? ` · ${note}` : ''}
			</p>
		</div>
	);
}

export function LanguageDistribution(): ReactElement | null {
	const t = useTranslations('github.languages');
	const tCommon = useTranslations('common');
	const { impersonatedUserId } = useImpersonation();

	const { data, isPending } = useQuery({ queryKey: ['github-languages', impersonatedUserId], queryFn: getLanguages });
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
						<Button
							onClick={() => reconnect.mutate()}
							disabled={reconnect.isPending || Boolean(impersonatedUserId)}
						>
							<Github className="h-4 w-4" />
							{t('reconnect')}
						</Button>
					</div>
				) : data.status === 'rate-limited' ? (
					<span className="text-muted-foreground text-sm">{t('rateLimited')}</span>
				) : data.status === 'ok' ? (
					<LanguageChart
						languages={data.languages}
						repoCount={data.repoCount}
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
