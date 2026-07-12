import type { ReactElement } from 'react';
import { FolderKanban } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PagePlaceholder } from '@/components/app-shell/PagePlaceholder';

export default async function MyProjectPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<ReactElement> {
	const { locale } = await params;
	setRequestLocale(locale);

	const tNav = await getTranslations('nav');
	const tPages = await getTranslations('pages');

	return (
		<PagePlaceholder
			Icon={FolderKanban}
			title={tNav('myProject')}
			description={tPages('myProjectSubtitle')}
			badge={tPages('comingSoon')}
		/>
	);
}
