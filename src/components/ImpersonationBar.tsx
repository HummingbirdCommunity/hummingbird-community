'use client';

import type { ReactElement } from 'react';
import { Eye, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useImpersonation } from '@/components/ImpersonationProvider';

// Card-width notice shown above the dashboard cards while an admin is viewing
// another account. Rendered in the content column (not a global strip), so it
// inherits the card width and flows above them.
export function ImpersonationBar(): ReactElement | null {
	const t = useTranslations('impersonation');
	const { impersonatedUserId, impersonatedName, clear } = useImpersonation();

	if (!impersonatedUserId) return null;

	const name = impersonatedName ?? impersonatedUserId.slice(0, 8);

	return (
		<div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
			<span className="flex items-center gap-1.5 font-medium">
				<Eye className="size-4 shrink-0" aria-hidden />
				{t('viewingAs', { name })}
			</span>
			<button
				type="button"
				onClick={clear}
				className="flex shrink-0 items-center gap-1 rounded-full border border-amber-300 px-2.5 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
			>
				<X className="size-3.5" aria-hidden />
				{t('exit')}
			</button>
		</div>
	);
}
