import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { QueryProvider } from '@/components/QueryProvider';
import { Toaster } from '@/components/ui/sonner';
import { routing } from '@/i18n/routing';

import '../globals.css';

export const metadata: Metadata = {
	title: 'Hummingbird Community',
	description: 'A community for people to connect, share, and grow together.',
	openGraph: {
		title: 'Hummingbird Community',
		description: 'A community for people to connect, share, and grow together.',
		type: 'website',
	},
	twitter: {
		card: 'summary',
		title: 'Hummingbird Community',
		description: 'A community for people to connect, share, and grow together.',
	},
};

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
		<html lang={locale}>
			<body className="antialiased">
				<NextIntlClientProvider>
					<QueryProvider>{children}</QueryProvider>
					<Toaster />
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
