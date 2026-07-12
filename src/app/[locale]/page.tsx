import type { ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { use } from 'react';

import { FloatingLanguageSwitcher } from '@/components/FloatingLanguageSwitcher';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }): ReactElement {
	const { locale } = use(params);
	setRequestLocale(locale);

	const t = useTranslations('home');
	const tCommon = useTranslations('common');

	return (
		<>
			<FloatingLanguageSwitcher />
			<div className="bg-app-canvas flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-lg">
					<div className="mb-8 text-center">
						<Image
							src="/hb-logo.png"
							alt={tCommon('appName')}
							width={112}
							height={112}
							priority
							className="mx-auto mb-4 h-28 w-28 object-contain"
						/>
						<h1 className="text-foreground mb-2 text-4xl font-bold">{tCommon('appName')}</h1>
						<p className="text-muted-foreground">{t('tagline')}</p>
					</div>

					<div className="bg-card mb-6 rounded-2xl p-8 text-center shadow-xl">
						<h2 className="text-foreground mb-2 text-2xl font-semibold">{t('comingSoon')}</h2>
						<p className="text-muted-foreground mb-6 text-sm">{t('blurb')}</p>
						<Button asChild className="w-full">
							<Link href="/login">{tCommon('signInSignUp')}</Link>
						</Button>
					</div>
				</div>
			</div>
		</>
	);
}
