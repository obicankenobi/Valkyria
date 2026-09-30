// artFactory.test.ts — tillgångsfabriken (scripts/build-art.mjs). Binder fabriken till
// appen: varje verb i VERB_ICON har en ikon, ikonerna är deterministiska och följer
// husstilen (.claude/skills/art-director), och de incheckade filerna är inte inaktuella.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { VERB_ICON } from '../src/components/Shell.js'

// @ts-expect-error — .mjs utan typdeklaration
import { buildArt } from '../scripts/build-art.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { ICON_SHAPES, makeIcon } from '../scripts/art/icons.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { INK_WEAR_VARIANTS, makeInkWear } from '../scripts/art/wear.mjs'
// @ts-expect-error — .mjs utan typdeklaration
import { readPalette } from '../scripts/art/core.mjs'

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
