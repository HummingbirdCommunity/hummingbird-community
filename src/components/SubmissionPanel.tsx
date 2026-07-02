'use client';

import type { LucideIcon } from 'lucide-react';
import type { ChangeEvent, ReactElement } from 'react';
import { Briefcase, FileText, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import type { SubmissionKind } from '@/lib/submissions';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { submitFile, validateFile } from '@/lib/submissions';

const OPTIONS: { kind: SubmissionKind; icon: LucideIcon }[] = [
	{ kind: 'resume', icon: FileText },
	{ kind: 'jd', icon: Briefcase },
];

export function SubmissionPanel(): ReactElement {
	const t = useTranslations('panel');
	const [kind, setKind] = useState<SubmissionKind | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	function reset() {
		setKind(null);
		setFile(null);
		setSubmitting(false);
	}

	function handleSelectFile(e: ChangeEvent<HTMLInputElement>) {
		const chosen = e.target.files?.[0];
		e.target.value = '';
		if (!chosen) return;
		const error = validateFile(chosen);
		if (error) {
			toast.error(error === 'not-pdf' ? t('errorNotPdf') : t('errorTooLarge'));
			return;
		}
		setFile(chosen);
	}

	async function handleSubmit() {
		if (!kind || !file) return;
		setSubmitting(true);
		try {
			await submitFile(kind, file);
			toast.success(t(`${kind}.success`));
			reset();
		} catch {
			toast.error(t('errorGeneric'));
			setSubmitting(false);
		}
	}

	if (kind) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t(`${kind}.title`)}</CardTitle>
					<CardDescription>{t(`${kind}.description`)}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<input
						ref={inputRef}
						type="file"
						accept="application/pdf"
						className="hidden"
						onChange={handleSelectFile}
					/>
					<div className="flex items-center gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={submitting}
						>
							<Upload className="h-4 w-4" />
							{t('choosePdf')}
						</Button>
						<span className="text-muted-foreground truncate text-sm">{file?.name ?? t('fileHint')}</span>
					</div>
					<div className="flex gap-2">
						<Button type="button" onClick={handleSubmit} disabled={!file || submitting}>
							{submitting ? t('uploading') : t('submit')}
						</Button>
						<Button type="button" variant="ghost" onClick={reset} disabled={submitting}>
							{t('cancel')}
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('title')}</CardTitle>
				<CardDescription>{t('subtitle')}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4 sm:grid-cols-2">
				{OPTIONS.map(({ kind: optionKind, icon: Icon }) => (
					<button
						key={optionKind}
						type="button"
						onClick={() => setKind(optionKind)}
						className="hover:border-ring hover:bg-accent flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors"
					>
						<Icon className="text-primary h-5 w-5" />
						<span className="font-medium">{t(`${optionKind}.title`)}</span>
						<span className="text-muted-foreground text-sm">{t(`${optionKind}.description`)}</span>
					</button>
				))}
			</CardContent>
		</Card>
	);
}
