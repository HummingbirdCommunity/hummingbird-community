'use client';

import type { ReactElement } from 'react';
import { Compass, FolderKanban, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Primary navigation for the app shell. Collapses to an icon-only rail on small
// screens (labels hidden) and expands to a full-width column on md+, so it never
// breaks narrow layouts without needing a JS drawer.
const navItems = [
	{ href: '/profile', labelKey: 'myProfile', Icon: User },
	{ href: '/explore', labelKey: 'explore', Icon: Compass },
	{ href: '/my-project', labelKey: 'myProject', Icon: FolderKanban },
] as const;

export function Sidebar(): ReactElement {
	const t = useTranslations('nav');
	const tCommon = useTranslations('common');
	const pathname = usePathname();

	return (
		<aside className="bg-card flex w-16 shrink-0 flex-col border-r md:w-60">
			<Link
				href="/profile"
				className="hover:bg-accent flex items-center gap-2 border-b px-3 py-4 transition-colors md:px-4"
			>
				<Image
					src="/hb-logo.png"
					alt={tCommon('appName')}
					width={32}
					height={32}
					className="h-8 w-8 shrink-0 object-contain"
				/>
				<span className="text-foreground hidden truncate font-semibold md:inline">{tCommon('appName')}</span>
			</Link>

			<nav aria-label={t('primary')} className="flex flex-1 flex-col gap-1 p-2 md:p-3">
				{navItems.map(({ href, labelKey, Icon }) => {
					const active = pathname === href || pathname.startsWith(`${href}/`);
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? 'page' : undefined}
							className={cn(
								'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
								'justify-center md:justify-start',
								active
									? 'bg-accent text-accent-foreground'
									: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
							)}
						>
							<Icon className="size-5 shrink-0" aria-hidden />
							<span className="sr-only md:not-sr-only">{t(labelKey)}</span>
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}
