# Color system

Hummingbird's colors are defined once, as design tokens, in
[`src/app/globals.css`](../../src/app/globals.css). This is the single source of truth —
components never hardcode hex values. To see every token rendered live, run the app and open
**`/dev`** (a dev-only board; it 404s in every deployed environment).

## How it's layered

Two tiers. **Change Tier 1 to re-skin the whole app** — Tier 2 and every component follow
automatically.

- **Tier 1 — primitives** (`:root`, literal hex): the raw brand colors. This is the reskin
  edit point.
- **Tier 2 — semantic tokens** (`:root`, `var()` references): shadcn roles (`--primary`,
  `--muted`, …) that point at Tier 1. Components (Button, Card, Input) consume these.
- **`@theme`** exposes both as Tailwind utilities (`bg-primary`, `text-ink`, `bg-canvas`,
  `text-link`, …).

## Palette & roles

### Structural — the premium base

| Token        | Hex       | Role                                                                            |
| ------------ | --------- | ------------------------------------------------------------------------------- |
| `--ink-navy` | `#14283A` | **Primary.** Dark surfaces, buttons, and body text. Carries the "premium" feel. |
| `--deep-ink` | `#0D1B29` | Deepest shade / depth (darkest surfaces, layering).                             |

### Accents — use sparingly

| Token         | Hex       | Role                                                                                      |
| ------------- | --------- | ----------------------------------------------------------------------------------------- |
| `--teal`      | `#12A08D` | Bright accent: **large** text, highlights, focus ring. Not for small white-on-teal text.  |
| `--teal-link` | `#0C8272` | Accessible teal for **small** link / accent text (4.72:1 on white). Utility: `text-link`. |
| `--sky-teal`  | `#2FB7A4` | Hover / highlight variant.                                                                |
| `--mint`      | `#8FD9BC` | Soft tint fills on light (e.g. tag backgrounds).                                          |
| `--lime`      | `#A8DB6E` | **Spark** — rare CTA pop only. Ink text, never white. Utility: `bg-brand-cta`.            |

### Neutrals & surfaces

| Token            | Hex       | Role                                                                      |
| ---------------- | --------- | ------------------------------------------------------------------------- |
| `--canvas`       | `#F7FAF8` | App background (`--background`).                                          |
| `--surface`      | `#FFFFFF` | Cards, sheets (`--card`, `--popover`).                                    |
| `--hairline`     | `#E1EAE5` | Borders, inputs (`--border`, `--input`).                                  |
| `--muted-strong` | `#5E6E68` | Muted / secondary text (`--muted-foreground`). AA-safe on white.          |
| `--danger`       | `#E5484D` | Error / destructive (`--destructive`). The palette has no red of its own. |

## Usage rules

- **Actions / buttons** → `--primary` (Ink Navy) with white text. ~15:1, AAA.
- **Links & small teal accents** → `text-link` (`--teal-link`). Bright `--teal` only for large
  headings, highlights, and the focus ring — it fails AA as normal-size text on white (3.26:1).
- **Lime** is a spark: at most one small element per view, always with Ink text (never white).
- **Mint** is a background tint only; pair with Ink or teal text, never white.
- **Warning toasts** stay amber (`text-yellow-500`) — the palette intentionally has no warning
  color, and amber reads clearer than forcing a brand hue. Add one to the palette if this
  changes.

## Re-skinning

Edit the Tier 1 hex values in the `:root` block of `globals.css`. That's it — semantic tokens
and components update automatically, and `/dev` reflects the change on reload. Adding a brand
new token there also appears on `/dev` with no extra code.

## Dark mode

Deferred. `.dark` in `globals.css` is a functional placeholder (kept so toggling doesn't
break) but has not been designed against this palette.
