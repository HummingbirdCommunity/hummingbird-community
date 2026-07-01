import type { Metadata } from 'next';

import { QueryProvider } from '@/components/QueryProvider';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className="antialiased">
				<QueryProvider>{children}</QueryProvider>
				<Toaster />
			</body>
		</html>
	);
}
