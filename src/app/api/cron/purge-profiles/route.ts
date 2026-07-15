// GET /api/cron/purge-profiles — scheduled hard delete of expired non-member
// observed profiles (HB-28 §7/§9). Privacy requirement: rows for people who
// aren't platform users are truly deleted, not just marked stale. Invoked by
// Vercel Cron, which sends `Authorization: Bearer $CRON_SECRET`.

import { supabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
	const secret = process.env.CRON_SECRET;
	if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
		return Response.json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Only non-member (subject_user_id is null) observed profiles are purged;
	// members' own profiles and authored profiles are kept.
	const { data, error } = await supabase
		.from('developer_profiles')
		.delete()
		.eq('source', 'observed')
		.is('subject_user_id', null)
		.lt('purge_after', new Date().toISOString())
		.select('id');

	if (error) {
		console.error('[purge-profiles] hard delete failed:', error);
		return Response.json({ error: 'Purge failed' }, { status: 500 });
	}

	const deleted = data?.length ?? 0;
	console.log(`[purge-profiles] hard-deleted ${deleted} expired observed profile(s)`);
	return Response.json({ deleted });
}
