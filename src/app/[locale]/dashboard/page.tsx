import { redirect } from '@/i18n/navigation';

// /dashboard moved into the app shell as /profile (HB-16). Redirect any lingering
// links and bookmarks so they don't 404.
export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
	const { locale } = await params;
	redirect({ href: '/profile', locale });
}
