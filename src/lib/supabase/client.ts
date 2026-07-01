import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

// Build the browser client lazily so that importing this module never throws
// (supabase-js throws when the URL/key are empty). This keeps `next build` from
// crashing while prerendering pages when the env vars aren't set — the error is
// deferred until Supabase is actually used.
function getClient(): SupabaseClient {
	if (client) return client;
	if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
		throw new Error('Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
	}
	client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
		auth: { persistSession: true, detectSessionInUrl: true },
		realtime: {
			params: {
				eventsPerSecond: 10,
			},
		},
	});
	return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
	get(_target, prop, receiver) {
		const value = Reflect.get(getClient(), prop, receiver);
		return typeof value === 'function' ? value.bind(getClient()) : value;
	},
});
