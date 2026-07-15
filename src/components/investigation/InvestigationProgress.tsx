'use client';

import type { ReactElement } from 'react';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import type { InvestigationProgress as ProgressUpdate } from '@/lib/agent/types';

import { supabase } from '@/lib/supabase/client';

import type { InvestigationResultData } from './InvestigationResult';
import { InvestigationResult } from './InvestigationResult';

interface Props {
	runId: string;
}

export function InvestigationProgress({ runId }: Props): ReactElement {
	const t = useTranslations('investigate.progress');
	const [steps, setSteps] = useState<
		Array<{ key: string; params?: Record<string, string | number>; status?: 'warning' }>
	>([]);
	const [result, setResult] = useState<InvestigationResultData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [streamDone, setStreamDone] = useState(false);

	// Stream progress updates
	useEffect(() => {
		const controller = new AbortController();

		async function fetchStream() {
			try {
				const res = await fetch(`/api/agent/stream?runId=${runId}`, {
					signal: controller.signal,
				});
				if (!res.ok || !res.body) {
					setError(t('failed'));
					setStreamDone(true);
					return;
				}

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						const trimmed = line.trim();
						if (!trimmed) continue;
						const jsonStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed;
						try {
							const parsed = JSON.parse(jsonStr) as ProgressUpdate;
							if (parsed.phase && parsed.key) {
								setSteps((prev) => [
									...prev,
									{ key: parsed.key, params: parsed.params, status: parsed.status },
								]);
							}
						} catch {
							// skip
						}
					}
				}
			} catch {
				if (controller.signal.aborted) return;
				setError(t('failed'));
			} finally {
				setStreamDone(true);
			}
		}

		fetchStream();
		return () => controller.abort();
	}, [runId, t]);

	// Fetch final result once stream ends
	useEffect(() => {
		if (!streamDone || error) return;

		async function fetchResult() {
			try {
				const {
					data: { session },
				} = await supabase.auth.getSession();
				if (!session) return;

				const res = await fetch(`/api/agent/result?runId=${runId}`, {
					headers: { Authorization: `Bearer ${session.access_token}` },
				});
				if (res.ok) {
					setResult(await res.json());
				} else {
					// A failed result fetch must surface as an error, not an
					// endless spinner.
					setError(t('failed'));
				}
			} catch {
				setError(t('failed'));
			}
		}

		fetchResult();
	}, [streamDone, runId, error, t]);

	// A step is "done" once the result loads or an error ends the run; otherwise
	// the last step keeps spinning while work is still in flight.
	const allDone = result !== null || error !== null;

	return (
		<div className="space-y-6">
			{/* Live progress steps */}
			<div className="space-y-4">
				<h2 className="text-lg font-semibold">{t('title')}</h2>
				<div className="space-y-2">
					{steps.map((step, i) => {
						const isLast = i === steps.length - 1;
						const done = isLast ? allDone : true;
						const isWarning = step.status === 'warning';

						return (
							<div key={i} className="flex items-center gap-2 text-sm">
								{isWarning ? (
									<AlertTriangle className="size-4 shrink-0 text-amber-500" />
								) : done ? (
									<CheckCircle className="size-4 shrink-0 text-green-500" />
								) : (
									<Loader2 className="text-primary size-4 shrink-0 animate-spin" />
								)}
								<span
									className={
										isWarning
											? 'text-amber-600 dark:text-amber-400'
											: done
												? 'text-muted-foreground'
												: 'text-foreground font-medium'
									}
								>
									{t(step.key, step.params)}
								</span>
							</div>
						);
					})}

					{/* Show spinner while waiting for first message */}
					{!streamDone && steps.length === 0 && (
						<div className="flex items-center gap-2 text-sm">
							<Loader2 className="text-primary size-4 animate-spin" />
							<span className="text-muted-foreground">{t('connecting')}</span>
						</div>
					)}
				</div>

				{error && <p className="text-sm text-red-600">{error}</p>}
			</div>

			{result && <InvestigationResult result={result} />}
		</div>
	);
}
