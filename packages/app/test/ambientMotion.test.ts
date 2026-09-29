// ambientMotion.test.ts — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5, ordagrant:
// "Omgivningsrörelse animeras bara med `transform` och `opacity`, och högst ett
// trettiotal element rör sig samtidigt."). Regeln fanns som prosa sedan P73 och
// bröts av två av de fyra oändliga kartanimationerna (stroke-dashoffset, r) utan
// att något märkte det — så den binds här mot själva CSS-filen. En oändlig
// animation är per definition omgivningsrörelse; en som reagerar på en handling
// (200 ms, en gång) är ett tillståndsbyte och omfattas inte (regel 15).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Kommentarerna nämner "animation: none" flitigt — utan att strippa dem sväljer
// en regex den riktiga deklarationen som följer efter kommentaren.
const CSS = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

// Namnen på alla @keyframes som en `animation:`-deklaration kör oändligt.
function infiniteKeyframeNames(css: string): string[] {
  const names = new Set<string>()
  for (const match of css.matchAll(/animation:\s*([^;]+);/g)) {
    const value = match[1]!
    if (!/\binfinite\b/.test(value)) continue
    const name = value.trim().split(/\s+/)[0]!
    if (name !== 'none') names.add(name)
  }
  return [...names]
}

// Egenskaperna som en @keyframes-regel animerar (alla steg tillsammans).
function keyframeProperties(css: string, name: string): string[] {
  const start = css.indexOf(`@keyframes ${name}`)
  if (start === -1) throw new Error(`@keyframes ${name} saknas`)
  let depth = 0
  let end = start
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const body = css.slice(css.indexOf('{', start) + 1, end)
  const props = new Set<string>()
  for (const declaration of body.matchAll(/([a-z-]+)\s*:[^;{}]+;/g)) props.add(declaration[1]!)
  return [...props]
}

describe('omgivningsrörelse — bara transform och opacity (§12 punkt 5)', () => {
  const names = infiniteKeyframeNames(CSS)

  it('hittar de oändliga animationerna (annars testar det ingenting)', () => {
    expect(names.length).toBeGreaterThanOrEqual(4)
    expect(names).toEqual(
      expect.arrayContaining(['map-supply-flow', 'map-frontline-shimmer', 'map-heat-breathe', 'map-station-pulse']),
    )
  })

  for (const name of names) {
    it(`${name} animerar bara transform och/eller opacity`, () => {
      const properties = keyframeProperties(CSS, name)
      expect(properties.length).toBeGreaterThan(0)
      for (const property of properties) {
        expect(['transform', 'opacity'], `${name} animerar ${property}`).toContain(property)
      }
    })
  }

  it('bildfrekvensvaktens avstängningsregel täcker varje oändlig kartanimation', () => {
    const offRule = CSS.slice(CSS.indexOf(":root[data-ambient='off']"))
    for (const match of CSS.matchAll(/([.\w-]+)\s*\{[^}]*animation:\s*([\w-]+)[^;]*infinite/g)) {
      const selector = match[1]!
      if (!selector.startsWith('.map-')) continue
      expect(offRule, `${selector} saknas i data-ambient="off"-regeln`).toContain(selector)
    }
  })
})
