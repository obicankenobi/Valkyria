// verbIconUsage.test.ts — handlingskorten i CountryFile/ThePolitics och exempel-slotsen på komponentsidan
// ritar verbets ikon ur tillgångsfabriken (VerbIcon), inte ett hårdkodat Unicode-tecken. Ikonen väljs
// med verbets namn — en källa (src/verbIcons.ts), så ett verb ser likadant ut överallt.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (file: string): string => readFileSync(join(import.meta.dirname, '../src/components', file), 'utf8')

describe('verbikoner i handlingskort', () => {
  it('CountryFile: varje VerbButton har en <VerbIcon verb=…>, inga icon="…"-literaler', () => {
    const src = read('CountryFile.tsx')
    expect(src.match(/\bicon="[^"]*"/g) ?? []).toEqual([])
    for (const verb of ['INFLUENCE', 'EXPAND', 'WITHDRAW', 'REOPEN', 'LEAK', 'SABOTAGE', 'TURN', 'RECRUIT']) {
      expect(src, verb).toContain(`<VerbIcon verb="${verb}" />`)
    }
  })

  it('ThePolitics: varje VerbButton har en <VerbIcon verb=…>, inga icon="…"-literaler', () => {
    const src = read('ThePolitics.tsx')
    expect(src.match(/\bicon="[^"]*"/g) ?? []).toEqual([])
    for (const verb of ['BRIBE', 'FUND_CAMPAIGN', 'FAVOUR', 'ASSASSINATE', 'STAGE_INCIDENT', 'BACK_CHANNEL', 'FUND_COUP', 'BROKER']) {
      expect(src, verb).toContain(`<VerbIcon verb="${verb}" />`)
    }
  })

  it('komponentsidans exempel-handlingsplatser visar verbikoner, inte tecken', () => {
    const src = read('ComponentLibrary.tsx')
    expect(src).toContain('<VerbIcon verb="RECRUIT" />')
    expect(src).toContain('<VerbIcon verb="BRIBE" />')
    expect(src).not.toMatch(/<ActionSlot icon="/)
  })
})
