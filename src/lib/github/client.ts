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

export async function getStatus(): Promise<GitHubStatus> {
	const response = await fetch('/api/github/status', { headers: await authHeaders() });
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
