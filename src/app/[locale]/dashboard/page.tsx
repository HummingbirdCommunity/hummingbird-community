'use client';

import type { ReactElement } from 'react';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';

export default function DashboardPage(): ReactElement | null {
	const router = useRouter();
	const { isLoggedIn, user, userEmail, loading } = useAuth();
	const [displayName, setDisplayName] = useState<string | null>(null);

	// Gate: send unauthenticated visitors to the login page.
	useEffect(() => {
		if (!loading && !isLoggedIn) {
			router.replace('/login');
		}
	}, [loading, isLoggedIn, router]);

	// Load the signed-in user's profile row (created automatically on signup).
	useEffect(() => {
		if (!user) return;
		supabase
			.from('profiles')
			.select('display_name')
			.eq('id', user.id)
			.maybeSingle()
			.then(({ data }) => setDisplayName(data?.display_name ?? null));
	}, [user]);

	async function handleSignOut() {
		const { error } = await supabase.auth.signOut();
		if (error) {
			toast.error(error.message);
			return;
		}
		toast.success('Signed out.');
		router.replace('/login');
	}

	if (loading || !isLoggedIn) {
		return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
			<div className="w-full max-w-lg">
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">Welcome{displayName ? `, ${displayName}` : ''} 👋</CardTitle>
						<CardDescription>You&apos;re signed in to Hummingbird Community.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<dl className="text-sm">
							<div className="flex justify-between border-b py-2">
								<dt className="text-muted-foreground">Email</dt>
								<dd className="font-medium">{userEmail}</dd>
							</div>
							<div className="flex justify-between py-2">
								<dt className="text-muted-foreground">User ID</dt>
								<dd className="font-mono text-xs">{user?.id}</dd>
							</div>
						</dl>
						<Button variant="outline" className="w-full" onClick={handleSignOut}>
							<LogOut className="h-4 w-4" />
							Sign out
						</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
