import type { ReactElement, ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';

import { AuthGate } from '@/components/app-shell/AuthGate';
import { Header } from '@/components/app-shell/Header';
import { Sidebar } from '@/components/app-shell/Sidebar';

export default async function AppLayout({
	children,
	params,
}: Readonly<{
	children: ReactNode;
	params: Promise<{ locale: string }>;
}>): Promise<ReactElement> {
	const { locale } = await params;
	setRequestLocale(locale);

	return (
		<AuthGate>
			<div className="bg-app-canvas flex min-h-screen">
				<Sidebar />
				<div className="flex min-w-0 flex-1 flex-col">
					<Header />
					<main className="flex-1">{children}</main>
				</div>
			</div>
		</AuthGate>
	);
}
