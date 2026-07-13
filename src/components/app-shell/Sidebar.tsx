'use client';

import type { ReactElement } from 'react';
import { Compass, FolderKanban, Search, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

// Primary navigation for the app shell. Collapses to an icon-only rail on small
// screens (labels hidden) and expands to a full-width column on md+, so it never
// breaks narrow layouts without needing a JS drawer.
const navItems = [
	{ href: '/profile', labelKey: 'myProfile', Icon: User },
	{ href: '/explore', labelKey: 'explore', Icon: Compass },
	{ href: '/my-project', labelKey: 'myProject', Icon: FolderKanban },
	{ href: '/investigate', labelKey: 'investigate', Icon: Search },
] as const;

export function Sidebar(): ReactElement {
	const t = useTranslations('nav');
	const pathname = usePathname();

	// Own scroll panel: overflow-y-auto so a long nav scrolls independently of the
	// main content rather than moving the whole page.
	return (
		<aside className="bg-card flex w-16 shrink-0 flex-col overflow-y-auto border-r md:w-60">
			<nav aria-label={t('primary')} className="flex flex-1 flex-col gap-1 p-2 md:p-3">
				{navItems.map(({ href, labelKey, Icon }) => {
					const active = pathname === href || pathname.startsWith(`${href}/`);
					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? 'page' : undefined}
							className={cn(
								'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
								'justify-center md:justify-start',
								active
									? 'bg-deep-ink text-white'
									: 'text-foreground/80 hover:bg-muted hover:text-foreground'
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
