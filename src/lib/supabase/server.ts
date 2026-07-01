import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

// Lazy service-role client (server only). Deferred construction keeps `next build`
// from throwing when the env vars aren't present at build time.
function getClient(): SupabaseClient {
	if (client) return client;
	if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('Supabase env vars missing: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
	}
	client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
	});
	return client;
}

export const supabase = new Proxy({} as SupabaseClient, {
	get(_target, prop, receiver) {
		const value = Reflect.get(getClient(), prop, receiver);
		return typeof value === 'function' ? value.bind(getClient()) : value;
	},
});
