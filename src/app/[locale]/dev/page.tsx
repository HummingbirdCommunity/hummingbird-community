import type { ReactElement } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { use } from 'react';

import { ColorBoard } from './ColorBoard';

// Dev-only design reference. Blocked in every deployed environment (build sets
// NODE_ENV=production), so it can never ship to real users.
export default function DevColorsPage({ params }: { params: Promise<{ locale: string }> }): ReactElement {
	if (process.env.NODE_ENV === 'production') notFound();

	const { locale } = use(params);
	setRequestLocale(locale);

	return <ColorBoard />;
}
