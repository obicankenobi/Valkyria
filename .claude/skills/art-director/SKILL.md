---
name: art-director
description: Use when creating or changing any visual asset or visual styling in THE SEVENTH FRONT — icons, stamps, textures, map graphics, SVG, raster images, colours, fonts — so it matches the 1965 war-room look and passes self-review before it ships.
---

# Art director — THE SEVENTH FRONT

The game looks like **a physical war room in 1965**: printed paper map with acetate and
grease pencil, manila folders, typewriter text, bakelite buttons, Dymo tape, telex paper,
a lacquered steel HUD with gauges. (Etapp 7 rule 8, `docs/ETAPP7_TEKNISK_SPEC.md` §3/§10.)

## Hard rules

- **Never:** glow effects, neon colours, gradients in neon colours, glassmorphism, anything
  that looks like a screen from the future. No real brands, logos, flags, insignia or real
  people. No text baked into generated images (text belongs in the DOM).
- **Palette is read, never copied:** the `:root` tokens in `packages/app/src/styles.css`
  (`--bg`, `--panel`, `--line`, `--ink`, `--amber`, `--amber-ink`, `--red`, `--blue`,
  `--steel`, `--steel-ink`, `--sea`, `--sepia-ink`). Scripts use `readPalette()` from
  `packages/app/scripts/art/core.mjs`. Small text in ochre uses `--amber-ink` (contrast).
- **Fonts (bundled, @fontsource):** Archivo Narrow (labels, UI), Stardos Stencil (stamps,
  headings), Courier Prime (typewriter/telex), Libre Baskerville (body/newspaper).
- **Rules 11, 14, 18 still apply:** hit targets ≥ 44×44 px, minimum text sizes, no clipped or
  overlapping text (CI checks it).

## Where assets come from (in this order)

1. **The asset factory** — `packages/app/scripts/build-art.mjs` (`npm run build:art -w
   @seventh-front/app`). Deterministic, seeded, no Math.random. Owns:
   - `public/art/icons/<VERB>.svg` — from `scripts/art/icons.mjs` (`ICON_SHAPES`)
   - `public/art/wear/ink-wear-<n>.svg` — stamp wear masks from `scripts/art/wear.mjs`
   - `docs/ui/art/index.html` — the contact sheet
   Never hand-edit generated files; change the generator and rebuild.
2. **Hand-written SVG in components** for anything data-driven (map, gauges, charts).
3. **Raster images** only for portraits/event pictures, using the locked style prompts in
   `docs/GRAFISKA_TILLGANGAR_ETAPP7.md` (STYLE LOCK / EVENT STYLE LOCK). Claude does not
   generate raster images itself; the owner does.
4. **Third-party assets:** CC0 or OFL only, logged in the matching `LICENSER.md`.

## Icon style

24×24 grid, `stroke="currentColor"`, stroke-width 1.8, square caps, miter joins, `fill="none"`
(dots may be filled with currentColor), `aria-hidden="true"`, hand wobble `rough = 0.35`.
Shapes: `line`, `poly`, `rect`, `circle`, `ellipse`, `arc`, `dot`. One clear pictogram per
verb, no two alike, readable at 20–24 px. A new verb (e.g. etapp 9's) gets a new entry in
`ICON_SHAPES`; `test/artFactory.test.ts` fails if a verb in `VERB_ICON` has no icon.

## Stamps

Stamp text stays in the DOM (fonts, screen readers, rule 18). Wear is a CSS mask:
`mask-image: url(/art/wear/ink-wear-N.svg); mask-size: 100% 100%` on the stamp element, a
slight rotation (−5°…+5°), border and text in `--red` or `--amber-ink`. Pick the variant by
a stable hash of the stamp's id, never randomly at render time.

## Self-review loop (required before committing visual work)

1. `npm run build:art -w @seventh-front/app`
2. `node packages/app/scripts/art/render-sheet.mjs <scratchpad>/sheet.png`, then **Read the
   PNG and look at it.**
3. Checklist, for each asset: reads as what it means at 24 px? distinct from its neighbours?
   works on both paper and steel? nothing glows, nothing neon? no text in the art? If any
   answer is no, change the generator and repeat.
4. When the asset is wired into the app: `npm run shots` (rule 17), Read the phone and desktop
   screenshots, compare with `docs/ui/reference/`.
5. `npx vitest run packages/app/test/artFactory.test.ts` (determinism, coverage, style, and
   that checked-in files match the generator), plus the normal `npm test`.

## Budgets

Icon SVG ≤ 2 kB each, wear mask ≤ 12 kB, any single raster image ≤ 300 kB (WebP/JPEG).
