'use client';

import type { ReactElement } from 'react';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';

type Token = { name: string; raw: string; hex: string };

function rgbToHex(rgb: string): string {
	const parts = rgb.match(/[\d.]+/g);
	if (!parts || parts.length < 3) return rgb;
	const [r, g, b, a] = parts.map(Number);
	const channels = [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
	const alpha =
		a !== undefined && a < 1
			? Math.round(a * 255)
					.toString(16)
					.padStart(2, '0')
			: '';
	return `#${channels}${alpha}`.toUpperCase();
}

// Reads every custom property declared on :root straight from the stylesheet, then
// resolves each to the color the browser actually renders (var chains and all) via a
// throwaway probe element. New tokens in globals.css show up here with no code change.
function readRootTokens(): Token[] {
	const raws = new Map<string, string>();
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			continue; // cross-origin sheet, skip
		}
		for (const rule of Array.from(rules)) {
			if (!(rule instanceof CSSStyleRule)) continue;
			if (!rule.selectorText.split(',').some((s) => s.trim() === ':root')) continue;
			for (let i = 0; i < rule.style.length; i++) {
				const prop = rule.style[i];
				if (prop.startsWith('--')) raws.set(prop, rule.style.getPropertyValue(prop).trim());
			}
		}
	}

	const probe = document.createElement('div');
	probe.style.display = 'none';
	document.body.appendChild(probe);

	const tokens: Token[] = [];
	for (const [name, raw] of raws) {
		probe.style.backgroundColor = '';
		probe.style.backgroundColor = `var(${name})`;
		const resolved = getComputedStyle(probe).backgroundColor;
		// Non-color tokens (e.g. --radius) leave the probe transparent — drop them.
		if (!resolved || resolved === 'rgba(0, 0, 0, 0)' || resolved === 'transparent') continue;
		tokens.push({ name, raw, hex: rgbToHex(resolved) });
	}
	probe.remove();
	return tokens;
}

function Swatch({ token }: { token: Token }): ReactElement {
	return (
		<div className="bg-card overflow-hidden rounded-xl border shadow-sm">
			<div className="h-20 w-full border-b" style={{ backgroundColor: `var(${token.name})` }} />
			<div className="space-y-0.5 p-3">
				<div className="text-foreground font-mono text-xs font-semibold">{token.name}</div>
				<div className="text-muted-foreground font-mono text-xs">{token.hex}</div>
				{token.raw.startsWith('var(') && (
					<div className="text-muted-foreground/80 font-mono text-[10px]">→ {token.raw}</div>
				)}
			</div>
		</div>
	);
}

function Section({ title, note, tokens }: { title: string; note: string; tokens: Token[] }): ReactElement {
	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-foreground text-lg font-semibold">{title}</h2>
				<p className="text-muted-foreground text-sm">{note}</p>
			</div>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
				{tokens.map((t) => (
					<Swatch key={t.name} token={t} />
				))}
			</div>
		</section>
	);
}

const EMPTY: Token[] = [];
let tokenCache: Token[] | null = null;

// The DOM stylesheets are external state read once after mount; useSyncExternalStore
// resolves the server (empty) / client (tokens) difference without a hydration error.
function getTokensSnapshot(): Token[] {
	if (tokenCache === null) tokenCache = readRootTokens();
	return tokenCache;
}

// Tokens never change at runtime, so there is nothing to subscribe to.
const subscribeTokens = (): (() => void) => () => {};
const getServerTokensSnapshot = (): Token[] => EMPTY;

export function ColorBoard(): ReactElement {
	const tokens = useSyncExternalStore(subscribeTokens, getTokensSnapshot, getServerTokensSnapshot);

	const primitives = tokens.filter((t) => !t.raw.startsWith('var('));
	const semantic = tokens.filter((t) => t.raw.startsWith('var('));

	return (
		<main className="bg-app-canvas min-h-screen px-6 py-16 sm:px-10">
			<div className="mx-auto max-w-6xl space-y-10">
				<header className="space-y-2">
					<span className="bg-secondary text-secondary-foreground inline-block rounded-full px-3 py-1 text-xs font-medium">
						Dev only · auto-synced from globals.css
					</span>
					<h1 className="text-foreground text-3xl font-bold">Color system</h1>
					<p className="text-muted-foreground max-w-2xl text-sm">
						Live swatches read straight from the <code className="font-mono">:root</code> custom properties.
						Change a hex or add a token in <code className="font-mono">globals.css</code> and it appears
						here automatically.
					</p>
				</header>

				{tokens.length === 0 ? (
					<p className="text-muted-foreground text-sm">Reading tokens…</p>
				) : (
					<>
						<Section
							title="Primitives (Tier 1)"
							note="Raw brand colors. Edit these to re-skin the whole app."
							tokens={primitives}
						/>
						<Section
							title="Semantic tokens (Tier 2)"
							note="shadcn roles that reference the primitives above."
							tokens={semantic}
						/>

						<section className="space-y-3">
							<h2 className="text-foreground text-lg font-semibold">Live preview</h2>
							<div className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-6 shadow-sm">
								<Button>Primary</Button>
								<Button variant="secondary">Secondary</Button>
								<Button variant="outline">Outline</Button>
								<Button variant="ghost">Ghost</Button>
								<Button variant="destructive">Destructive</Button>
								<a href="#" className="text-link text-sm font-medium hover:underline">
									Teal link
								</a>
								<span className="bg-brand-mint/40 text-link rounded-full px-3 py-1 text-xs font-medium">
									Mint tag
								</span>
								<span className="bg-brand-cta rounded-full px-3 py-1 text-xs font-semibold">
									Lime spark
								</span>
							</div>
						</section>
					</>
				)}
			</div>
		</main>
	);
}
