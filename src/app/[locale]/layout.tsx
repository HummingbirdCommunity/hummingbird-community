import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { ImpersonationProvider } from '@/components/ImpersonationProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { QueryProvider } from '@/components/QueryProvider';
import { Toaster } from '@/components/ui/sonner';
import { UserSwitcher } from '@/components/UserSwitcher';
import { routing } from '@/i18n/routing';

import '../globals.css';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: 'metadata' });
	const tCommon = await getTranslations({ locale, namespace: 'common' });

	const title = tCommon('appName');
	const description = t('description');

	return {
		title,
		description,
		icons: { icon: '/favicon.png' },
		openGraph: { title, description, type: 'website' },
		twitter: { card: 'summary', title, description },
	};
}

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}>) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}
	setRequestLocale(locale);

	return (
		// translate="no": the app is fully bilingual (en/zh) with its own switcher,
		// so Chrome's auto-translate prompt (fired when a page's lang differs from the
		// browser language, e.g. a zh browser pinned to the en locale) is redundant
		// noise. Suppress it site-wide (HB-14).
		<html lang={locale} translate="no">
			<body className="antialiased">
				<NextIntlClientProvider>
					<QueryProvider>
						<ImpersonationProvider>
							<div className="fixed top-4 left-4 z-50">
								<UserSwitcher />
							</div>
							<div className="fixed top-4 right-4 z-50">
								<LanguageSwitcher />
							</div>
							{children}
						</ImpersonationProvider>
					</QueryProvider>
					<Toaster />
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
