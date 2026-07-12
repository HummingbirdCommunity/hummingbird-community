'use client';

import type { ChangeEvent, ReactElement } from 'react';
import { Rocket, Upload, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useImpersonation } from '@/components/ImpersonationProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from '@/i18n/navigation';
import { createProject, validateLogo } from '@/lib/projects';

const NAME_MAX = 80;
const TAGLINE_MAX = 120;
const MANIFESTO_MAX = 2000;

export function CreateProjectPanel(): ReactElement | null {
	const t = useTranslations('project');
	const router = useRouter();
	const { impersonatedUserId } = useImpersonation();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [tagline, setTagline] = useState('');
	const [manifesto, setManifesto] = useState('');
	const [repoUrl, setRepoUrl] = useState('');
	const [logo, setLogo] = useState<File | null>(null);
	const [logoPreview, setLogoPreview] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	// Release the preview's object URL when it's replaced or the panel unmounts.
	useEffect(() => {
		if (!logoPreview) return;
		return () => URL.revokeObjectURL(logoPreview);
	}, [logoPreview]);

	// Launching always runs as the real signed-in user (Storage stamps owner_id),
	// so there's no meaningful "launch as another account" — hide while viewing one.
	if (impersonatedUserId) return null;

	function clearLogo() {
		setLogo(null);
		setLogoPreview(null);
	}

	function reset() {
		setOpen(false);
		setName('');
		setTagline('');
		setManifesto('');
		setRepoUrl('');
		clearLogo();
		setSubmitting(false);
	}

	function handleSelectLogo(e: ChangeEvent<HTMLInputElement>) {
		const chosen = e.target.files?.[0];
		e.target.value = '';
		if (!chosen) return;
		const error = validateLogo(chosen);
		if (error) {
			toast.error(error === 'not-image' ? t('form.errorLogoType') : t('form.errorLogoTooLarge'));
			return;
		}
		setLogo(chosen);
		setLogoPreview(URL.createObjectURL(chosen));
	}

	async function handleSubmit() {
		if (!name.trim() || !tagline.trim() || !manifesto.trim()) return;
		setSubmitting(true);
		try {
			await createProject({ name, tagline, manifesto, repoUrl, logo });
			toast.success(t('form.success'));
			reset();
			router.refresh();
		} catch {
			toast.error(t('form.errorGeneric'));
			setSubmitting(false);
		}
	}

	if (!open) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t('launchTitle')}</CardTitle>
					<CardDescription>{t('launchSubtitle')}</CardDescription>
				</CardHeader>
				<CardContent>
					<Button type="button" onClick={() => setOpen(true)}>
						<Rocket className="h-4 w-4" />
						{t('launchCta')}
					</Button>
				</CardContent>
			</Card>
		);
	}

	const canSubmit = !!name.trim() && !!tagline.trim() && !!manifesto.trim() && !submitting;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t('form.title')}</CardTitle>
				<CardDescription>{t('form.subtitle')}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				<div className="space-y-2">
					<Label htmlFor="project-name">{t('form.nameLabel')}</Label>
					<Input
						id="project-name"
						value={name}
						maxLength={NAME_MAX}
						placeholder={t('form.namePlaceholder')}
						onChange={(e) => setName(e.target.value)}
						disabled={submitting}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="project-tagline">{t('form.taglineLabel')}</Label>
					<Input
						id="project-tagline"
						value={tagline}
						maxLength={TAGLINE_MAX}
						placeholder={t('form.taglinePlaceholder')}
						onChange={(e) => setTagline(e.target.value)}
						disabled={submitting}
					/>
					<p className="text-muted-foreground text-right text-xs">
						{t('form.charCount', { count: tagline.length, max: TAGLINE_MAX })}
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="project-manifesto">{t('form.manifestoLabel')}</Label>
					<p className="text-muted-foreground text-sm">{t('form.manifestoHint')}</p>
					<Textarea
						id="project-manifesto"
						value={manifesto}
						maxLength={MANIFESTO_MAX}
						rows={6}
						placeholder={t('form.manifestoPlaceholder')}
						onChange={(e) => setManifesto(e.target.value)}
						disabled={submitting}
					/>
					<p className="text-muted-foreground text-right text-xs">
						{t('form.charCount', { count: manifesto.length, max: MANIFESTO_MAX })}
					</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor="project-repo">{t('form.repoUrlLabel')}</Label>
					<Input
						id="project-repo"
						type="url"
						value={repoUrl}
						placeholder={t('form.repoUrlPlaceholder')}
						onChange={(e) => setRepoUrl(e.target.value)}
						disabled={submitting}
					/>
				</div>

				<div className="space-y-2">
					<Label>{t('form.logoLabel')}</Label>
					<input
						ref={inputRef}
						type="file"
						accept="image/png,image/jpeg,image/webp"
						className="hidden"
						onChange={handleSelectLogo}
					/>
					<div className="flex items-center gap-3">
						{logoPreview ? (
							<Image
								src={logoPreview}
								alt=""
								width={48}
								height={48}
								unoptimized
								className="size-12 rounded-md border object-cover"
							/>
						) : null}
						<Button
							type="button"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={submitting}
						>
							<Upload className="h-4 w-4" />
							{t('form.chooseLogo')}
						</Button>
						{logo ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={clearLogo}
								disabled={submitting}
								aria-label={t('form.cancel')}
							>
								<X className="h-4 w-4" />
							</Button>
						) : null}
					</div>
					<p className="text-muted-foreground text-xs">{t('form.logoHint')}</p>
				</div>

				<div className="flex gap-2">
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						{submitting ? t('form.submitting') : t('form.submit')}
					</Button>
					<Button type="button" variant="ghost" onClick={reset} disabled={submitting}>
						{t('form.cancel')}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
