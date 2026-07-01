'use client';

import type { User } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase/client';

export interface AuthState {
	isLoggedIn: boolean;
	user: User | null;
	userEmail: string | null;
	loading: boolean;
}

/**
 * Global auth hook that listens to Supabase auth state changes.
 * Uses onAuthStateChange (no polling) plus an initial getSession check.
 */
export function useAuth(): AuthState {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let mounted = true;

		supabase.auth
			.getSession()
			.then(({ data: { session } }) => {
				if (!mounted) return;
				setUser(session?.user ?? null);
				setLoading(false);
			})
			.catch((error) => {
				console.error('[use-auth] Failed to get session:', error);
				if (mounted) {
					setUser(null);
					setLoading(false);
				}
			});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, session) => {
			if (!mounted) return;
			setUser(session?.user ?? null);
			setLoading(false);
		});

		return () => {
			mounted = false;
			subscription.unsubscribe();
		};
	}, []);

	return {
		isLoggedIn: !!user,
		user,
		userEmail: user?.email ?? null,
		loading,
	};
}
