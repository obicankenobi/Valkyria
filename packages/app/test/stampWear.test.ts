// stampWear.test.ts — slitagemaskerna (public/art/wear/ink-wear-N.svg, tillgångsfabriken) väljs per stämpel
// med en STABIL hash av stämpelns id (art-director-skillen: "never randomly at render time").
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WEAR_VARIANTS, wearClass, wearVariant } from '../src/stampWear.js'

// @ts-expect-error — .mjs utan typdeklaration
import { INK_WEAR_VARIANTS } from '../scripts/art/wear.mjs'

describe('stampWear', () => {
  it('har lika många varianter som fabriken genererar, och en fil för var och en', () => {
    expect(WEAR_VARIANTS).toBe(INK_WEAR_VARIANTS)
    for (let n = 1; n <= WEAR_VARIANTS; n++) {
      expect(existsSync(join(import.meta.dirname, `../public/art/wear/ink-wear-${n}.svg`)), `ink-wear-${n}.svg`).toBe(true)
    }
  })

  it('ger samma variant för samma id, alltid, och alltid inom 1..N', () => {
    for (const id of ['order-0-1-deadline', 'T03', 'crisis-eyes-only', '', 'å ä ö']) {
      expect(wearVariant(id)).toBe(wearVariant(id))
      expect(wearVariant(id)).toBeGreaterThanOrEqual(1)
      expect(wearVariant(id)).toBeLessThanOrEqual(WEAR_VARIANTS)
    }
  })

  it('har ett fast facit för ett par id:n (hashen får aldrig skifta tyst)', () => {
    expect(wearVariant('order-0-1-deadline')).toBe(wearVariant('order-0-1-deadline'))
    expect(wearVariant('a')).toBe(5)
    expect(wearVariant('order-1')).toBe(2)
  })

  it('sprider 60 olika id:n över minst fem av varianterna', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 60; i++) seen.add(wearVariant(`order-${i}-deadline`))
    expect(seen.size).toBeGreaterThanOrEqual(5)
  })

  it('wearClass ger klassen CSS:en binder masken till', () => {
    expect(wearClass('x')).toBe(`wear-${wearVariant('x')}`)
  })
})
