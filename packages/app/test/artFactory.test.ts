// artFactory.test.ts — tillgångsfabriken (scripts/build-art.mjs). Binder fabriken till
// appen: varje verb i VERB_ICON har en ikon, ikonerna är deterministiska och följer
// husstilen (.claude/skills/art-director), och de incheckade filerna är inte inaktuella.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VERB_ICON } from '../src/components/Shell.js'
import { SOUND_EFFECTS, AMBIENCE_NAMES } from '../src/sound.js'

// @ts-expect-error — .mjs utan typdeklaration
import { buildArt } from '../scripts/build-art.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { ICON_SHAPES, makeIcon } from '../scripts/art/icons.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { INK_WEAR_VARIANTS, makeInkWear } from '../scripts/art/wear.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { readPalette } from '../scripts/art/core.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { SEAL_IDS, makeSeal } from '../scripts/art/seals.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { PERSON_IDS, PERSON_SPECS, makeSilhouette } from '../scripts/art/silhouettes.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { BLUEPRINT_CATEGORIES, makeBlueprint } from '../scripts/art/blueprints.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { AGENCY, SPECIMEN_PAGES, fitHeadline, makeFrontPage, wrapText } from '../scripts/art/frontpage.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { SFX_NAMES, SFX_RECIPES, buildFilterGraph, findFfmpeg, measure, renderPcm } from '../scripts/art/sfx.mjs'
import rivals from '../../core/src/data/rivals.json'
import officials from '../../core/src/data/officials.json'
import successors from '../../core/src/data/successors.json'
import { TECH_CATEGORIES } from '@seventh-front/core'

const REPO = join(import.meta.dirname, '../../..')
const iconNames = Object.keys(ICON_SHAPES as Record<string, unknown>)

describe('tillgångsfabriken', () => {
  it('har en ikon för varje verb i VERB_ICON', () => {
    for (const verb of Object.keys(VERB_ICON)) expect(iconNames).toContain(verb)
  })

  it('är deterministisk', () => {
    for (const name of iconNames) expect(makeIcon(name)).toBe(makeIcon(name))
    expect(makeInkWear(3)).toBe(makeInkWear(3))
    expect(JSON.stringify(buildArt())).toBe(JSON.stringify(buildArt()))
  })

  it('ger 22 olika ikoner — inga dubbletter som Unicode-tecknen hade', () => {
    const drawn = iconNames.map((n) => makeIcon(n) as string)
    expect(new Set(drawn).size).toBe(drawn.length)
    const shapes = iconNames.map((n) => JSON.stringify((ICON_SHAPES as Record<string, unknown>)[n]))
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it('följer husstilen: ingen text, bara currentColor, 24-rutnät, aria-hidden', () => {
    for (const name of iconNames) {
      const svg = makeIcon(name) as string
      expect(svg).not.toMatch(/<text/)
      expect(svg).toContain('viewBox="0 0 24 24"')
      expect(svg).toContain('aria-hidden="true"')
      const colours = svg.match(/#[0-9a-fA-F]{3,8}/g) ?? []
      expect(colours).toEqual([])
    }
  })

  it('slitagemaskerna finns i alla varianter och skiljer sig åt', () => {
    const masks = Array.from({ length: INK_WEAR_VARIANTS as number }, (_, i) => makeInkWear(i + 1) as string)
    expect(new Set(masks).size).toBe(masks.length)
  })

  it('läser paletten ur styles.css', () => {
    const p = readPalette() as Record<string, string>
    for (const token of ['bg', 'panel', 'line', 'ink', 'red', 'amber-ink', 'steel', 'steel-ink']) expect(p[token]).toMatch(/^#/)
  })

  it('incheckade filer matchar generatorn (kör npm run build:art om detta fallerar)', () => {
    for (const [rel, content] of Object.entries(buildArt() as Record<string, string>)) {
      expect(readFileSync(join(REPO, rel), 'utf8'), rel).toBe(content)
    }
  })
})

// ── P155: sigill, siluetter, blåkopior, förstasidor och syntetiserade effekter ──────────────────────────────────────────────────
const kB = (text: string): number => Buffer.byteLength(text, 'utf8') / 1024

describe('sigill (10M)', () => {
  it('finns ett sigill per rivalhus i rivals.json, och inga extra', () => {
    expect([...(SEAL_IDS as string[])].sort()).toEqual(Object.keys(rivals).sort())
  })
  it('är distinkta, utan text, i currentColor och under budget', () => {
    const drawn = (SEAL_IDS as string[]).map((id) => makeSeal(id) as string)
    expect(new Set(drawn).size).toBe(drawn.length)
    for (const svg of drawn) {
      expect(svg).not.toMatch(/<text/)
      expect(svg).toContain('currentColor')
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}/)
      expect(kB(svg)).toBeLessThan(6)
    }
  })
})

describe('siluettporträtt (10M)', () => {
  it('täcker alla tjänstemän, ersättare och de tre ordförandena — med porträttfilernas namn', () => {
    const expected = [
      ...Object.entries(officials as Record<string, { post: string }[]>).flatMap(([f, list]) => list.map((o) => `official-${f}-${o.post}`)),
      ...Object.entries(successors as Record<string, string[]>).flatMap(([f, list]) => list.map((_, i) => `successor-${f}-${i + 1}`)),
      ...Object.keys(rivals).map((id) => `chairman-${id}`),
    ]
    expect([...(PERSON_IDS as string[])].sort()).toEqual(expected.sort())
  })
  it('är deterministiska, olika, utan text och inom budget; paletten är läst ur styles.css', () => {
    const palette = readPalette() as Record<string, string>
    const all = (PERSON_IDS as string[]).map((id) => makeSilhouette(id) as string)
    expect(all.map((s) => makeSilhouette((PERSON_IDS as string[])[all.indexOf(s)]) as string)).toEqual(all)
    expect(new Set(all).size).toBe(all.length)
    const allowed = new Set(Object.values(palette).map((c) => c.toLowerCase()))
    for (const svg of all) {
      expect(svg).not.toMatch(/<text/)
      expect(kB(svg)).toBeLessThan(8)
      for (const colour of svg.match(/#[0-9a-fA-F]{6}/g) ?? []) expect(allowed.has(colour.toLowerCase()), colour).toBe(true)
    }
    expect(Object.keys(PERSON_SPECS)).toEqual(PERSON_IDS)
  })
})

describe('blåkopior', () => {
  it('finns en per materielkategori i kärnan, olika och utan text', () => {
    expect([...(BLUEPRINT_CATEGORIES as string[])].sort()).toEqual([...TECH_CATEGORIES].sort())
    const drawn = (BLUEPRINT_CATEGORIES as string[]).map((c) => makeBlueprint(c) as string)
    expect(new Set(drawn).size).toBe(drawn.length)
    for (const svg of drawn) {
      expect(svg).not.toMatch(/<text/)
      expect(kB(svg)).toBeLessThan(16)
    }
  })
})

describe('förstasidor', () => {
  it('är deterministiska och beror på frö och text', () => {
    const a = SPECIMEN_PAGES[0]
    expect(makeFrontPage(a)).toBe(makeFrontPage(a))
    expect(makeFrontPage({ ...a, seed: 'annat' })).not.toBe(makeFrontPage(a))
    expect(makeFrontPage({ ...a, headline: 'En annan rubrik' })).not.toBe(makeFrontPage(a))
  })
  it('bär den fiktiva byrån, datumraden och rubriken — och ingen verklig tidning', () => {
    const svg = makeFrontPage(SPECIMEN_PAGES[1]) as string
    expect(AGENCY).toBe('THE CALDER WIRE')
    expect(svg).toContain(AGENCY)
    expect(svg).toContain('SUNDAY 7 FEBRUARY 1965')
    for (const real of ['Times', 'Pravda', 'Reuters', 'Associated Press', 'Life', 'Tass']) expect(svg).not.toContain(real)
    expect(kB(svg)).toBeLessThan(40) // inline i DOM, byggs vid behov — ingen levererad fil
  })
  it('radbrytningen kapar aldrig en rad: ingen rad längre än sitt tak, och en för lång text slutar med utelämningstecken', () => {
    const long = 'word '.repeat(80)
    const lines = wrapText(long, 30, 3) as string[]
    expect(lines).toHaveLength(3)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(30)
    expect(lines[2]!.endsWith('…')).toBe(true)
    expect(wrapText('kort', 30, 3)).toEqual(['kort'])
    const fit = fitHeadline('A '.repeat(120)) as { size: number; lines: string[] }
    expect(fit.lines.length).toBeLessThanOrEqual(3)
    expect(fit.size).toBeGreaterThanOrEqual(13)
    expect((fitHeadline('SHORT HEADLINE') as { size: number }).size).toBe(24)
  })
  it('escapar XML i text', () => {
    const svg = makeFrontPage({ headline: 'A & B <C>', dateline: 'X', deck: '"q"' }) as string
    expect(svg).toContain('A &amp; B &lt;C&gt;')
    expect(svg).not.toContain('<C>')
  })
})

describe('syntetiserade effekter (10N)', () => {
  it('receptlistan är exakt de 18 saknade effekterna plus miljöljuden, utan newsreel-sting', () => {
    const expected = [...SOUND_EFFECTS.filter((n: string) => n !== 'newsreel-sting'), ...AMBIENCE_NAMES].sort()
    expect([...(SFX_NAMES as string[])].sort()).toEqual(expected)
    expect(expected).toHaveLength(20)
  })
  it('varje recept har lager, en rimlig längd och en filtergraf som slutar i [out]', () => {
    for (const name of SFX_NAMES as string[]) {
      const r = SFX_RECIPES[name]
      expect(r.layers.length, name).toBeGreaterThan(0)
      expect(r.duration, name).toBeGreaterThan(0.04)
      expect(buildFilterGraph(r), name).toMatch(/\[out\]$/)
      expect(buildFilterGraph(r)).toBe(buildFilterGraph(r))
    }
    for (const name of ['telex-loop', 'room-tone']) expect(SFX_RECIPES[name].loop).toBe(true)
  })
  it('de byggda filerna finns i public/sounds och håller budgeten (effekter totalt under 1 MB)', () => {
    let total = statSync(join(REPO, 'packages/app/public/sounds/newsreel-sting.mp3')).size
    for (const name of SFX_NAMES as string[]) {
      const file = join(REPO, `packages/app/public/sounds/${name}.mp3`)
      expect(existsSync(file), name).toBe(true)
      total += statSync(file).size
    }
    expect(total).toBeLessThan(1024 * 1024)
  })
  const ffmpeg = findFfmpeg() as string | null
  it.skipIf(!ffmpeg)('renderas utan fel, med rätt längd och nivå, utan klippning eller likspänning, och bitexakt två gånger', () => {
    for (const name of SFX_NAMES as string[]) {
      const first = renderPcm(name, ffmpeg) as Float32Array
      const q = measure(first) as { seconds: number; peak: number; rms: number; dc: number }
      expect(Math.abs(q.seconds - SFX_RECIPES[name].duration), `${name} längd`).toBeLessThan(0.03)
      expect(q.peak, `${name} tyst`).toBeGreaterThan(0.1)
      expect(q.peak, `${name} klipper`).toBeLessThan(0.95)
      expect(q.rms, `${name} nivå`).toBeGreaterThan(0.004)
      expect(Math.abs(q.dc), `${name} likspänning`).toBeLessThan(0.02)
      if (SFX_RECIPES[name].duration < 3) expect(Buffer.compare(Buffer.from(first.buffer, first.byteOffset, first.byteLength), Buffer.from((renderPcm(name, ffmpeg) as Float32Array).buffer)), `${name} determinism`).toBe(0)
    }
  })
})
