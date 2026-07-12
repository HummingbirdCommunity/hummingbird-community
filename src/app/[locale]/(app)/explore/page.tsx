import type { ReactElement } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Project } from '@/lib/projects';

import { CreateProjectPanel } from '@/components/CreateProjectPanel';
import { ProjectCard } from '@/components/ProjectCard';
import { supabase } from '@/lib/supabase/server';

// Live directory: render fresh each request so router.refresh() after a launch
// picks up the new project.
export const dynamic = 'force-dynamic';

export default async function ExplorePage({ params }: { params: Promise<{ locale: string }> }): Promise<ReactElement> {
	const { locale } = await params;
	setRequestLocale(locale);

	const t = await getTranslations('project');

	// Most recent launches, capped at 50 for now — search/pagination land later.
	const { data, error } = await supabase
		.from('projects')
		.select('id, owner_id, name, tagline, manifesto, repo_url, logo_path, created_at')
		.order('created_at', { ascending: false })
		.limit(50);
	if (error) console.error('[explore-projects] failed to load projects:', error);
	const projects = (data ?? []) as Project[];

	return (
		<div className="flex justify-center p-4">
			<div className="w-full max-w-2xl space-y-6">
				<CreateProjectPanel />
				{projects.length ? (
					<div className="space-y-4">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} viewLabel={t('list.viewProject')} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground py-8 text-center text-sm">{t('list.empty')}</p>
				)}
			</div>
		</div>
	);
}
