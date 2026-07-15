'use client';

import type { ReactElement, ReactNode } from 'react';

/** One structured evidence line: a label and an optional right-aligned value. */
export interface EvidenceRow {
	label: string;
	value?: string | number;
}

interface Props {
	/** The conclusion the card explains (the hover trigger). */
	children: ReactNode;
	/** Small heading inside the card, e.g. "842 commits · 63.5%". */
	title?: string;
	/** The evidence slice mapped from the snapshot. */
	rows: EvidenceRow[];
	/** Shown when no slice matched — a signal the claim has no structured backing. */
	empty: string;
}

/** A dependency-free hover-card: wraps a conclusion and reveals its evidence
 *  slice on hover or keyboard focus (HB-27, "省力档" audit). Positioned with
 *  Tailwind group utilities — no popover library. The trigger is focusable so
 *  the card is reachable without a pointer. */
export function EvidenceHover({ children, title, rows, empty }: Props): ReactElement {
	return (
		<span className="group relative inline-block">
			<span
				tabIndex={0}
				className="decoration-muted-foreground/40 cursor-help underline decoration-dotted underline-offset-2 outline-none"
			>
				{children}
			</span>
			<span
				role="tooltip"
				className="bg-background invisible absolute top-full left-0 z-10 mt-1 w-max max-w-xs rounded-md border p-2 text-left opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
			>
				{title && <span className="text-foreground mb-1 block text-xs font-medium">{title}</span>}
				{rows.length > 0 ? (
					<span className="block space-y-0.5">
						{rows.map((row) => (
							<span key={row.label} className="flex items-baseline justify-between gap-3 text-xs">
								<span className="text-muted-foreground truncate">{row.label}</span>
								{row.value != null && <span className="text-foreground shrink-0">{row.value}</span>}
							</span>
						))}
					</span>
				) : (
					<span className="text-muted-foreground block text-xs">{empty}</span>
				)}
			</span>
		</span>
	);
}
