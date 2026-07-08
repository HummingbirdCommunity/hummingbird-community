import type { SignatureRepo } from '@/lib/github/signature';

import { IMPERSONATION_STORAGE_KEY } from '@/components/ImpersonationProvider';
import { supabase } from '@/lib/supabase/client';

// Browser-side calls to the /api/github/* routes. Each attaches the Supabase
// access token as a bearer, since the session lives in the browser (localStorage)
// and the server routes authenticate from that header.

export interface GitHubStatus {
	connected: boolean;
	username: string | null;
	connectedAt: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!session) throw new Error('Not signed in');
	return { Authorization: `Bearer ${session.access_token}` };
}

// When an admin is viewing another account, forward the target as ?viewAs=. Read
// from sessionStorage (not React) so these plain functions stay hook-free; the
// server ignores the param for non-admins, so it's safe to always send.
function viewAsQuery(): string {
	if (typeof window === 'undefined') return '';
	const raw = window.sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
	if (!raw) return '';
	try {
		const { userId } = JSON.parse(raw) as { userId?: string };
		return userId ? `?viewAs=${encodeURIComponent(userId)}` : '';
	} catch {
		return '';
	}
}

export async function getStatus(): Promise<GitHubStatus> {
	const response = await fetch(`/api/github/status${viewAsQuery()}`, { headers: await authHeaders() });
	if (!response.ok) throw new Error('Failed to load GitHub status');
	return response.json();
}

// Fetches the authorize URL, then navigates the tab to GitHub. Returns only if
// the request failed (otherwise the page has already left for GitHub).
export async function startConnect(): Promise<void> {
	const response = await fetch('/api/github/authorize', { headers: await authHeaders() });
	if (!response.ok) throw new Error('Failed to start GitHub connect');
	const { url } = (await response.json()) as { url: string };
	window.location.assign(url);
}

export async function disconnect(): Promise<void> {
	const response = await fetch('/api/github/disconnect', { method: 'POST', headers: await authHeaders() });
	if (!response.ok) throw new Error('Failed to disconnect GitHub');
}

export type LanguagesResponse =
	| {
			status: 'ok';
			languages: Record<string, number>;
			repoCount: number;
			computedAt: string;
			stale: boolean;
			disconnected: boolean;
	  }
	| { status: 'needs-reauth' }
	| { status: 'rate-limited' }
	| { status: 'error' }
	| { status: 'no-data' };

export async function getLanguages(): Promise<LanguagesResponse> {
	const response = await fetch(`/api/github/languages${viewAsQuery()}`, { headers: await authHeaders() });
	if (!response.ok) throw new Error('Failed to load language distribution');
	return response.json();
}

export type SignatureReposResponse =
	| {
			status: 'ok';
			repos: SignatureRepo[];
			computedAt: string;
			stale: boolean;
			disconnected: boolean;
	  }
	| { status: 'needs-reauth' }
	| { status: 'rate-limited' }
	| { status: 'error' }
	| { status: 'no-data' };

export async function getSignatureRepos(): Promise<SignatureReposResponse> {
	const response = await fetch(`/api/github/signature${viewAsQuery()}`, { headers: await authHeaders() });
	if (!response.ok) throw new Error('Failed to load signature repositories');
	return response.json();
}
