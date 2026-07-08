'use client';

import type { ReactElement } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Github } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { useImpersonation } from '@/components/ImpersonationProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { disconnect, getStatus, startConnect } from '@/lib/github/client';

// Bare prefixes for invalidation — they prefix-match every per-user scoped key.
const STATUS_KEY = ['github-status'];
const LANGUAGES_KEY = ['github-languages'];

export function GitHubConnectionCard(): ReactElement {
	const t = useTranslations('github');
	const tCommon = useTranslations('common');
	const tImpersonation = useTranslations('impersonation');
	const queryClient = useQueryClient();
	const { impersonatedUserId } = useImpersonation();

	// Scope the query per viewed user so switching accounts refetches instead of
	// showing the previous user's status.
	const { data, isPending } = useQuery({ queryKey: [...STATUS_KEY, impersonatedUserId], queryFn: getStatus });

	const connect = useMutation({
		mutationFn: startConnect,
		onError: () => toast.error(t('errorToast')),
	});

	const disconnectAccount = useMutation({
		mutationFn: disconnect,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: STATUS_KEY });
			// Refetch the language card so it flips to its paused (disconnected) state.
			queryClient.invalidateQueries({ queryKey: LANGUAGES_KEY });
			toast.success(t('disconnectedToast'));
		},
		onError: () => toast.error(t('errorToast')),
	});

	// Handle the callback's ?github=connected|error return: toast, refresh the
	// status, then strip the param so a reload doesn't replay the toast. Stripping
	// first also makes this safe under React's double-invoked effects.
	useEffect(() => {
		const status = new URLSearchParams(window.location.search).get('github');
		if (!status) return;
		window.history.replaceState(null, '', window.location.pathname);
		if (status === 'connected') {
			toast.success(t('connectedToast'));
			queryClient.invalidateQueries({ queryKey: STATUS_KEY });
			queryClient.invalidateQueries({ queryKey: LANGUAGES_KEY });
		} else if (status === 'already-linked') {
			toast.error(t('alreadyLinkedToast'));
		} else if (status === 'error') {
			toast.error(t('errorToast'));
		}
	}, [t, queryClient]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Github className="h-5 w-5" />
					{t('title')}
				</CardTitle>
				<CardDescription>
					{data?.connected ? t('connectedAs', { username: data.username ?? '' }) : t('subtitle')}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<span className="text-muted-foreground text-sm">{tCommon('loading')}</span>
				) : impersonatedUserId ? (
					// Connect/disconnect act on the real signed-in user, so hide them while
					// impersonating — the card stays a read-only view of the target's status.
					<span className="text-muted-foreground text-sm">{tImpersonation('readOnly')}</span>
				) : data?.connected ? (
					<Button
						variant="outline"
						onClick={() => disconnectAccount.mutate()}
						disabled={disconnectAccount.isPending}
					>
						{disconnectAccount.isPending ? t('disconnecting') : t('disconnect')}
					</Button>
				) : (
					<Button onClick={() => connect.mutate()} disabled={connect.isPending}>
						<Github className="h-4 w-4" />
						{connect.isPending ? t('connecting') : t('connect')}
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
