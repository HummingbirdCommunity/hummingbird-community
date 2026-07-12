import type { ReactElement } from 'react';
import { ExternalLink, FolderGit2 } from 'lucide-react';
import Image from 'next/image';

import type { Project } from '@/lib/projects';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { logoPublicUrl } from '@/lib/projects';

export function ProjectCard({ project, viewLabel }: { project: Project; viewLabel: string }): ReactElement {
	// repo_url is free user input — only follow http(s) links so a stored
	// `javascript:`/`data:` URL can't run when the card is clicked.
	const repoUrl = project.repo_url && /^https?:\/\//i.test(project.repo_url) ? project.repo_url : null;

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-3">
					{project.logo_path ? (
						<Image
							src={logoPublicUrl(project.logo_path)}
							alt=""
							width={40}
							height={40}
							unoptimized
							className="size-10 shrink-0 rounded-md border object-cover"
						/>
					) : (
						<div className="bg-secondary text-link flex size-10 shrink-0 items-center justify-center rounded-md">
							<FolderGit2 className="size-5" aria-hidden />
						</div>
					)}
					<CardTitle className="truncate">{project.name}</CardTitle>
				</div>
				<CardDescription>{project.tagline}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<p className="text-foreground/80 line-clamp-4 text-sm whitespace-pre-line">{project.manifesto}</p>
				{repoUrl ? (
					<a
						href={repoUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="text-link inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
					>
						<ExternalLink className="size-4" aria-hidden />
						{viewLabel}
					</a>
				) : null}
			</CardContent>
		</Card>
	);
}
