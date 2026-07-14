'use client';

import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import type { InvestigationListItem } from '@/app/api/agent/investigations/route';

import { Link } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase/client';

async function fetchInvestigations(): Promise<InvestigationListItem[]> {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) return [];

	const res = await fetch('/api/agent/investigations', {
		headers: { Authorization: `Bearer ${session.access_token}` },
	});
	if (!res.ok) throw new Error('Failed to load investigations');
	const data = (await res.json()) as { items: InvestigationListItem[] };
	return data.items;
}

function StatusIcon({ status }: { status: string }): ReactElement {
	if (status === 'completed') return <CheckCircle className="size-4 shrink-0 text-green-500" />;
	if (status === 'failed') return <XCircle className="size-4 shrink-0 text-red-500" />;
	return <Loader2 className="text-primary size-4 shrink-0 animate-spin" />;
}

export function RecentInvestigations(): ReactElement | null {
	const t = useTranslations('investigate');
	const format = useFormatter();

	const { data: items } = useQuery({
		queryKey: ['investigations'],
		queryFn: fetchInvestigations,
	});

	if (!items) return null;

	return (
		<div className="space-y-3">
			<h2 className="text-sm font-semibold">{t('recentTitle')}</h2>
			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">{t('empty')}</p>
			) : (
				<ul className="divide-border divide-y rounded-md border">
					{items.map((item) => {
						const row = (
							<div className="flex items-center gap-3 px-3 py-2 text-sm">
								<StatusIcon status={item.status} />
								<span className="flex-1 font-medium">{item.targetUsername}</span>
								<span className="text-muted-foreground flex items-center gap-1 text-xs">
									<Clock className="size-3" />
									{format.relativeTime(new Date(item.createdAt))}
								</span>
							</div>
						);
						// Only completed/running rows have a result page worth opening; a
						// row with no run id (start() never returned) isn't linkable.
						return (
							<li key={`${item.runId ?? item.targetUsername}-${item.createdAt}`}>
								{item.runId ? (
									<Link href={`/investigate/${item.runId}`} className="hover:bg-muted block">
										{row}
									</Link>
								) : (
									row
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
