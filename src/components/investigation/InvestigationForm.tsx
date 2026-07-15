'use client';

import type { FormEvent, ReactElement } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/i18n/navigation';
import { supabase } from '@/lib/supabase/client';

import type { InvestigationResultData } from './InvestigationResult';
import { InvestigationResult } from './InvestigationResult';

type InvestigateResponse =
	| { status: 'started'; runId: string }
	| { status: 'cached'; result: InvestigationResultData }
	| { error: string };

export function InvestigationForm(): ReactElement {
	const t = useTranslations('investigate');
	const router = useRouter();
	const [username, setUsername] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [cached, setCached] = useState<InvestigationResultData | null>(null);

	async function handleSubmit(e: FormEvent) {
		e.preventDefault();
		const trimmed = username.trim();
		if (!trimmed) return;

		setSubmitting(true);
		setCached(null);
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

			const data = (await res.json()) as InvestigateResponse;
			if (!res.ok || 'error' in data) {
				toast.error(('error' in data && data.error) || t('errorGeneric'));
				return;
			}

			// A cache hit (HB-28) has no workflow run to poll — render it in place;
			// a fresh run navigates to its progress page.
			if (data.status === 'cached') {
				setCached(data.result);
			} else {
				router.push(`/investigate/${data.runId}`);
			}
		} catch {
			toast.error(t('errorGeneric'));
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="space-y-6">
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

			{cached && (
				<div className="space-y-2">
					<p className="text-muted-foreground text-xs">{t('cached')}</p>
					<InvestigationResult result={cached} />
				</div>
			)}
		</div>
	);
}
