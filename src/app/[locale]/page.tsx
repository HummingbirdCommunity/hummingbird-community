import type { ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { use } from 'react';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export default function HomePage({ params }: { params: Promise<{ locale: string }> }): ReactElement {
	const { locale } = use(params);
	setRequestLocale(locale);

	const t = useTranslations('home');
	const tCommon = useTranslations('common');

	return (
		<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
			<div className="w-full max-w-lg">
				<div className="mb-8 text-center">
					<Image
						src="/logo.png"
						alt={tCommon('appName')}
						width={112}
						height={112}
						priority
						className="mx-auto mb-4 h-28 w-28 object-contain"
					/>
					<h1 className="bg-brand-gradient mb-2 bg-clip-text text-4xl font-bold text-transparent">
						{tCommon('appName')}
					</h1>
					<p className="text-gray-600">{t('tagline')}</p>
				</div>

				<div className="mb-6 rounded-2xl bg-white p-8 text-center shadow-xl">
					<h2 className="mb-2 text-2xl font-semibold text-gray-900">{t('comingSoon')}</h2>
					<p className="mb-6 text-sm text-gray-500">{t('blurb')}</p>
					<Button asChild className="w-full">
						<Link href="/login">{tCommon('signInSignUp')}</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
