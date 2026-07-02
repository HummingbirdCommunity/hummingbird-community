'use client';

import type { FormEvent, ReactElement } from 'react';
import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

export default function LoginPage(): ReactElement {
	const router = useRouter();
	const { isLoggedIn, loading: authLoading } = useAuth();
	const [mode, setMode] = useState<Mode>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [submitting, setSubmitting] = useState(false);

	// Already signed in? Bounce to the dashboard.
	useEffect(() => {
		if (!authLoading && isLoggedIn) {
			router.replace('/dashboard');
		}
	}, [authLoading, isLoggedIn, router]);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		try {
			if (mode === 'signup') {
				const { data, error } = await supabase.auth.signUp({ email, password });
				if (error) throw error;
				// When email confirmation is enabled, no session is returned until the user confirms.
				if (data.session) {
					toast.success('Account created — welcome!');
					router.replace('/dashboard');
				} else {
					toast.success('Check your email to confirm your account.');
				}
			} else {
				const { error } = await supabase.auth.signInWithPassword({ email, password });
				if (error) throw error;
				toast.success('Signed in.');
				router.replace('/dashboard');
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Something went wrong.');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
			<div className="w-full max-w-md">
				<div className="mb-8 text-center">
					<div className="bg-brand-gradient mb-4 inline-flex items-center justify-center rounded-2xl p-4">
						<Sparkles className="h-8 w-8 text-white" />
					</div>
					<h1 className="bg-brand-gradient bg-clip-text text-3xl font-bold text-transparent">
						Hummingbird Community
					</h1>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-xl">
							{mode === 'signin' ? 'Welcome back' : 'Create your account'}
						</CardTitle>
						<CardDescription>
							{mode === 'signin'
								? 'Sign in to continue to the community.'
								: 'Join the remote work community.'}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									autoComplete="email"
									required
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="you@example.com"
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
									required
									minLength={6}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									placeholder="••••••••"
								/>
							</div>
							<Button type="submit" className="w-full" disabled={submitting}>
								{submitting ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
							</Button>
						</form>

						<p className="text-muted-foreground mt-4 text-center text-sm">
							{mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
							<button
								type="button"
								className="text-primary font-medium hover:underline"
								onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
							>
								{mode === 'signin' ? 'Sign up' : 'Sign in'}
							</button>
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
