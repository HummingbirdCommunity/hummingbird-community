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
			{/* Viewport-locked shell: the header stays fixed on top while the sidebar
			    and main content each scroll in their own pane. */}
			<div className="bg-app-canvas flex h-dvh flex-col overflow-hidden">
				<Header />
				<div className="flex min-h-0 flex-1">
					<Sidebar />
					<main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
				</div>
			</div>
		</AuthGate>
	);
}
