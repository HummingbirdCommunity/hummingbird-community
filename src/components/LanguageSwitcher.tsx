'use client';

import type { ReactElement } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/utils';

const localeLabels: Record<(typeof routing.locales)[number], string> = {
	en: 'English',
	zh: '中文',
};

export function LanguageSwitcher(): ReactElement {
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const t = useTranslations('common');

	return (
		<div
			role="group"
			aria-label={t('switchLanguage')}
			className="bg-card/80 inline-flex items-center gap-1 rounded-full border p-1 shadow-sm backdrop-blur"
		>
			{routing.locales.map((loc) => (
				<button
					key={loc}
					type="button"
					aria-current={loc === locale}
					onClick={() => router.replace(pathname, { locale: loc })}
					className={cn(
						'rounded-full px-3 py-1 text-sm font-medium transition-colors',
						loc === locale
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:text-foreground'
					)}
				>
					{localeLabels[loc]}
				</button>
			))}
		</div>
	);
}
