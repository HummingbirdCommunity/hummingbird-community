import type { ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';

import { Card, CardContent } from '@/components/ui/card';
import { InvestigationProgress } from '@/components/investigation/InvestigationProgress';

export default async function InvestigationRunPage({
	params,
}: {
	params: Promise<{ locale: string; runId: string }>;
}): Promise<ReactElement> {
	const { locale, runId } = await params;
	setRequestLocale(locale);

	return (
		<div className="flex justify-center p-4">
			<div className="w-full max-w-2xl space-y-6">
				<Card>
					<CardContent>
						<InvestigationProgress runId={runId} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
