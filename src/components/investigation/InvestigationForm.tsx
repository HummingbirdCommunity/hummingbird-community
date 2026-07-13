'use client';

import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useRouter } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function InvestigationForm(): ReactElement {
	const t = useTranslations('investigate');
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = username.trim();
		if (!trimmed) return;

		setSubmitting(true);
		try {
			const {
				data: { session },
			} = await supabase.auth.getSession();
			if (!session) {
				toast.error('Please sign in first.');
				return;
			}

			const res = await fetch('/api/agent/investigate', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${session.access_token}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ username: trimmed }),
			});

			const data = await res.json();
			if (!res.ok) {
				toast.error(data.error ?? t('errorGeneric'));
				return;
			}

			router.push(`/investigate/${data.runId}`);
		} catch {
			toast.error(t('errorGeneric'));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex gap-2">
			<Input
				type="text"
				value={username}
				onChange={(e) => setUsername(e.target.value)}
				placeholder={t('usernamePlaceholder')}
				disabled={submitting}
				className="flex-1"
			/>
			<Button type="submit" disabled={submitting || !username.trim()}>
				<Search className="size-4" />
				{submitting ? t('submitting') : t('submit')}
			</Button>
		</form>
	);
}
