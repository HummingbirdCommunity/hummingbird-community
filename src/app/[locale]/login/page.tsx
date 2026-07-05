'use client';

import type { FormEvent, ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup';

export default function LoginPage(): ReactElement {
	const router = useRouter();
	const t = useTranslations('login');
	const tCommon = useTranslations('common');
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
					toast.success(t('accountCreated'));
					router.replace('/dashboard');
				} else {
					toast.success(t('checkEmail'));
				}
			} else {
				const { error } = await supabase.auth.signInWithPassword({ email, password });
				if (error) throw error;
				toast.success(t('signedIn'));
				router.replace('/dashboard');
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t('genericError'));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="bg-app-canvas flex min-h-screen items-center justify-center p-4">
			<div className="w-full max-w-md">
				<div className="mb-8 text-center">
					<Image
						src="/hb-logo.png"
						alt={tCommon('appName')}
						width={112}
						height={112}
						priority
						className="mx-auto mb-2 h-28 w-28 object-contain"
					/>
					<h1 className="text-foreground text-3xl font-bold">{tCommon('appName')}</h1>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-xl">
							{mode === 'signin' ? t('welcomeBack') : t('createAccount')}
						</CardTitle>
						<CardDescription>
							{mode === 'signin' ? t('signinSubtitle') : t('signupSubtitle')}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form onSubmit={handleSubmit} className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="email">{tCommon('email')}</Label>
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
								<Label htmlFor="password">{t('password')}</Label>
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
								{submitting ? t('pleaseWait') : mode === 'signin' ? t('signIn') : t('signUp')}
							</Button>
						</form>

						<p className="text-muted-foreground mt-4 text-center text-sm">
							{mode === 'signin' ? t('noAccount') : t('haveAccount')}{' '}
							<button
								type="button"
								className="text-primary font-medium hover:underline"
								onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
							>
								{mode === 'signin' ? t('signUp') : t('signIn')}
							</button>
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
