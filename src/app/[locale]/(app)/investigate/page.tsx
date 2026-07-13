import type { ReactElement } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvestigationForm } from '@/components/investigation/InvestigationForm';

export default async function InvestigatePage({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations('investigate');

	return (
		<div className="flex justify-center p-4">
			<div className="w-full max-w-2xl space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>{t('title')}</CardTitle>
						<CardDescription>{t('subtitle')}</CardDescription>
					</CardHeader>
					<CardContent>
						<InvestigationForm />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
