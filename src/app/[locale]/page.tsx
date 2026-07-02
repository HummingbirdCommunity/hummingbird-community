import type { ReactElement } from 'react';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function HomePage(): ReactElement {
	return (
		<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
			<div className="w-full max-w-lg">
				<div className="mb-8 text-center">
					<div className="bg-brand-gradient mb-4 inline-flex items-center justify-center rounded-2xl p-4">
						<Sparkles className="h-10 w-10 text-white" />
					</div>
					<h1 className="bg-brand-gradient mb-2 bg-clip-text text-4xl font-bold text-transparent">
						Hummingbird Community
					</h1>
					<p className="text-gray-600">A place for remote workers to connect, share, and grow together.</p>
				</div>

				<div className="mb-6 rounded-2xl bg-white p-8 text-center shadow-xl">
					<h2 className="mb-2 text-2xl font-semibold text-gray-900">Coming soon</h2>
					<p className="mb-6 text-sm text-gray-500">
						We&apos;re building something great. The infrastructure is up and running — features are on the
						way.
					</p>
					<Button asChild className="w-full">
						<Link href="/login">Sign in / Sign up</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
