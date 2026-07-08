'use client';

import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// Shared with the GitHub client so it can read the target while staying a plain
// (non-hook) module — both sides key off this exact sessionStorage entry.
export const IMPERSONATION_STORAGE_KEY = 'hb-impersonation';

interface StoredImpersonation {
	userId: string;
	name: string | null;
}

interface ImpersonationValue {
	impersonatedUserId: string | null;
	impersonatedName: string | null;
	setImpersonation: (userId: string, name: string | null) => void;
	clear: () => void;
}

const ImpersonationContext = createContext<ImpersonationValue | null>(null);

// Holds the admin's "view as user" target. Persisted in sessionStorage so a
// refresh keeps the impersonated view (and clears when the tab closes). This is
// UX state only — the real access check lives server-side in resolveTargetUserId.
export function ImpersonationProvider({ children }: { children: ReactNode }): ReactNode {
	const [state, setState] = useState<StoredImpersonation | null>(null);

	// Rehydrate after mount, not via a lazy initializer: sessionStorage is absent
	// during SSR, so seeding state from it on the first render would desync the
	// server (always null) and client HTML and trip a hydration mismatch. Both
	// render null first, then this effect syncs the persisted target in.
	useEffect(() => {
		const raw = sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
		if (!raw) return;
		try {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from an external store (sessionStorage)
			setState(JSON.parse(raw) as StoredImpersonation);
		} catch {
			sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
		}
	}, []);

	const setImpersonation = useCallback((userId: string, name: string | null) => {
		const next = { userId, name };
		// Write storage before state so a re-render's refetch already sees the target.
		sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(next));
		setState(next);
	}, []);

	const clear = useCallback(() => {
		sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
		setState(null);
	}, []);

	return (
		<ImpersonationContext.Provider
			value={{
				impersonatedUserId: state?.userId ?? null,
				impersonatedName: state?.name ?? null,
				setImpersonation,
				clear,
			}}
		>
			{children}
		</ImpersonationContext.Provider>
	);
}

export function useImpersonation(): ImpersonationValue {
	const ctx = useContext(ImpersonationContext);
	if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider');
	return ctx;
}
