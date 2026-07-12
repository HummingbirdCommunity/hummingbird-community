import type { ReactElement } from 'react';
import { Compass } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PagePlaceholder } from '@/components/app-shell/PagePlaceholder';

export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }): Promise<ReactElement> {
	const { locale } = await params;
	setRequestLocale(locale);

	const tNav = await getTranslations('nav');
	const tPages = await getTranslations('pages');

	return (
		<PagePlaceholder
			Icon={Compass}
			title={tNav('explore')}
			description={tPages('exploreSubtitle')}
			badge={tPages('comingSoon')}
		/>
	);
}
