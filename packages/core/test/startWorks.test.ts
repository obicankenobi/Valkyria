// Speltest 2026-10-17, beslut 13A: med AVI som specialisering var startverket ett flygverk, köparna beställer i början bara infanteri och artilleri,
// och varje order var LOCKED — partiet kunde inte komma igång. Startverket är nu allmänt (infanteri och artilleri) oavsett specialisering.
import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/state.js'
import { leadSupplierRejection } from '../src/leadSupplier.js'
import { autoAssignable } from '../src/outsourcing.js'
import { getProduct } from '../src/pricing.js'
import { worksCategories } from '../src/works.js'
import type { TechCategory } from '../src/types.js'

const CATEGORIES: TechCategory[] = ['artillery', 'armour', 'aviation', 'naval', 'electronics', 'infantry']

describe('det allmänna startverket (beslut 13A)', () => {
  it.each(CATEGORIES)('%s: infanteri- och artilleriordrar är inte låsta från start', (specialisation) => {
    const s = createInitialState('indochina-slice', `start-${specialisation}`, { specialisation })
    expect(leadSupplierRejection(s.house, getProduct('m1_rifle'), 8000)).toBeNull()
    expect(leadSupplierRejection(s.house, getProduct('105mm_field_gun'), 80)).toBeNull()
    expect(worksCategories(s.house.works[0]!)!.sort()).toEqual(['artillery', 'infantry'])
    expect(s.house.works.find((w) => w.kind === 'laboratory')!.category).toBe(specialisation) // labbet följer specialiseringen
  })

  it('specialiseringen är verkets huvudkategori när den ingår, annars den första', () => {
    expect(createInitialState('indochina-slice', 'a', { specialisation: 'artillery' }).house.works[0]!.category).toBe('artillery')
    expect(createInitialState('indochina-slice', 'b', { specialisation: 'infantry' }).house.works[0]!.category).toBe('infantry')
    expect(createInitialState('indochina-slice', 'c', { specialisation: 'aviation' }).house.works[0]!.category).toBe('infantry')
  })

  it('den automatiska tilldelningen lägger inte en extrakategori på startverket när ett eget verk för kategorin är i drift', () => {
    const s = createInitialState('indochina-slice', 'auto', { specialisation: 'artillery' })
    const line = s.house.works[0]!.lines[0]!.id
    const rifle = getProduct('m1_rifle')
    expect(autoAssignable(s.house, line, rifle)).toBe(true) // inget infanteriverk än: startverket tar ordern
    s.house.works.push({ ...s.house.works[0]!, id: 'works-9', category: 'infantry', extraCategories: undefined, lines: [] })
    expect(autoAssignable(s.house, line, rifle)).toBe(false) // nu går den till infanteriverket
    expect(autoAssignable(s.house, line, getProduct('105mm_field_gun'))).toBe(true) // huvudkategorin påverkas aldrig
  })
})
