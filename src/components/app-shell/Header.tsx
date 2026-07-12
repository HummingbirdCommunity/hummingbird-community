import type { ReactElement } from 'react';
import { getTranslations } from 'next-intl/server';
import Image from 'next/image';

import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { UserSwitcher } from '@/components/UserSwitcher';
import { Link } from '@/i18n/navigation';

// Full-width top bar of the app shell: brand on the left, the admin "view as
// user" switcher and the language switcher pinned right. Sits above the sidebar.
export async function Header(): Promise<ReactElement> {
	const t = await getTranslations('common');

	return (
		<header className="bg-card/80 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur">
			<Link href="/profile" className="flex items-center gap-2">
				<Image
					src="/hb-logo.png"
					alt={t('appName')}
					width={32}
					height={32}
					className="h-8 w-8 object-contain"
				/>
				<span className="text-foreground hidden font-semibold sm:inline">{t('appName')}</span>
			</Link>
			<div className="ml-auto flex items-center gap-2">
				<UserSwitcher />
				<LanguageSwitcher />
			</div>
		</header>
	);
}
