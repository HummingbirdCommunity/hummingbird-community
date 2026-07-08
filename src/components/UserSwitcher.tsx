'use client';

import type { ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { useImpersonation } from '@/components/ImpersonationProvider';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ProfileRow {
	id: string;
	display_name: string | null;
	is_admin: boolean;
}

function labelFor(profile: ProfileRow): string {
	return profile.display_name ?? profile.id.slice(0, 8);
}

// Admin-only "view as user" picker. Lists every profile; choosing one enters
// impersonation, choosing yourself exits it. Rendering is gated on the caller's
// own is_admin — but that's only cosmetic; the real gate is server-side.
export function UserSwitcher(): ReactElement | null {
	const t = useTranslations('impersonation');
	const { user, isLoggedIn } = useAuth();
	const { impersonatedUserId, setImpersonation, clear } = useImpersonation();
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const { data: profiles } = useQuery({
		queryKey: ['profiles-all'],
		enabled: isLoggedIn,
		queryFn: async (): Promise<ProfileRow[]> => {
			const { data, error } = await supabase
				.from('profiles')
				.select('id, display_name, is_admin')
				.order('display_name');
			if (error) throw error;
			return data ?? [];
		},
	});

	// Dismiss the menu on an outside click or Escape.
	useEffect(() => {
		if (!open) return;
		function onPointerDown(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') setOpen(false);
		}
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	const isAdmin = Boolean(profiles?.find((p) => p.id === user?.id)?.is_admin);
	if (!isLoggedIn || !user || !isAdmin || !profiles) return null;

	const currentId = impersonatedUserId ?? user.id;
	const current = profiles.find((p) => p.id === currentId);

	function handleSelect(id: string) {
		setOpen(false);
		if (!user || id === user.id) {
			clear();
			return;
		}
		const target = profiles?.find((p) => p.id === id);
		setImpersonation(id, target?.display_name ?? null);
	}

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={t('switchUser')}
				className="bg-card/80 hover:bg-accent focus-visible:ring-ring flex w-52 items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm backdrop-blur transition-colors focus-visible:ring-2 focus-visible:outline-none"
			>
				<Eye className="text-muted-foreground size-4 shrink-0" aria-hidden />
				<span className="flex-1 truncate text-left font-medium">{current ? labelFor(current) : currentId}</span>
				<ChevronDown className="text-muted-foreground size-4 shrink-0" aria-hidden />
			</button>

			{open && (
				<ul
					role="listbox"
					className="bg-popover text-popover-foreground absolute left-0 mt-1 max-h-80 w-52 overflow-auto rounded-md border shadow-md"
				>
					{profiles.map((profile) => {
						const selected = profile.id === currentId;
						return (
							<li key={profile.id} role="option" aria-selected={selected}>
								<button
									type="button"
									onClick={() => handleSelect(profile.id)}
									className="hover:bg-accent flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors"
								>
									<Check
										className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
										aria-hidden
									/>
									<span className="truncate">
										{profile.id === user.id
											? `${labelFor(profile)} (${t('you')})`
											: labelFor(profile)}
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
