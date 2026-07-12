import type { LucideProps } from 'lucide-react';
import type { ComponentType, ReactElement } from 'react';

// Shared "coming soon" scaffold for shell pages whose real content lands later.
export function PagePlaceholder({
	Icon,
	title,
	description,
	badge,
}: {
	Icon: ComponentType<LucideProps>;
	title: string;
	description: string;
	badge: string;
}): ReactElement {
	return (
		<div className="flex min-h-full items-center justify-center p-6">
			<div className="max-w-md text-center">
				<div className="bg-secondary text-link mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl">
					<Icon className="size-7" aria-hidden />
				</div>
				<span className="bg-muted text-muted-foreground inline-block rounded-full px-3 py-1 text-xs font-medium">
					{badge}
				</span>
				<h1 className="text-foreground mt-4 text-2xl font-semibold">{title}</h1>
				<p className="text-muted-foreground mt-2 text-sm">{description}</p>
			</div>
		</div>
	);
}
