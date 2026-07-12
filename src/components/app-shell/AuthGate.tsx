'use client';

import type { ReactElement, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/navigation';

// Gates the app shell: unauthenticated visitors are redirected to /login. While
// the session is resolving (or the redirect is in flight) it shows a loading
// state instead of flashing the protected content.
export function AuthGate({ children }: { children: ReactNode }): ReactElement {
	const router = useRouter();
	const tCommon = useTranslations('common');
	const { isLoggedIn, loading } = useAuth();

	useEffect(() => {
		if (!loading && !isLoggedIn) {
			router.replace('/login');
		}
	}, [loading, isLoggedIn, router]);

	if (loading || !isLoggedIn) {
		return (
			<div className="text-muted-foreground flex min-h-screen items-center justify-center">
				{tCommon('loading')}
			</div>
		);
	}

	return <>{children}</>;
}
