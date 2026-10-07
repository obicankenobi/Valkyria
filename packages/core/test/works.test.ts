// works.test.ts — P169 (ETAPP11_FORSLAG.md §3 11A/11K, §4, §10 skyddsräcke 1): anläggningsmodellen. Linjerna bor i monteringsverk; det finns inga
// fristående linjer kvar. Spelet ska inte ändras av att modellen byts — golden-attributionen står i ANDRINGSLOGG; här binds formen.
import { describe, expect, it } from 'vitest'
import facilities from '../src/data/facilities.json' with { type: 'json' }
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { validateAction } from '../src/validateAction.js'
import { allLines, assemblyWorks, findLine, freeLineSlots, lineCapacity, worksFromLines } from '../src/works.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import type { GameState, PlayerAction, ProductionLine } from '../src/types.js'

const F = facilities as unknown as {
  maxLevel: number
  interimStartLevel: number
  interimWorksCount: number
  linesPerLevel: number[]
  kinds: Record<string, { label: string; does: string }>
}
const B = balance as unknown as { maxProductionLines: number }
const turn = (s: GameState, actions: PlayerAction[] = []) => resolveTurn(s, { standingOrders: [], bids: [], actions })
const BUILD: PlayerAction = { type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }

function line(id: string): ProductionLine {
  return { id, productId: null, grade: 'A', unitsPerTurnAtFull: 40, capacityPct: 100, assignedContractId: null, status: 'idle', blockedReason: null, retoolingUntilTurn: null }
}

describe('facilities.json — de sju anläggningarna (§4.2)', () => {
  it('sju slag med namn och en mening vardera; nivå 1–3; ett monteringsverk rymmer 2/4/6 linjer', () => {
    expect(Object.keys(F.kinds).sort()).toEqual(['assembly', 'civil', 'component', 'depot', 'design', 'laboratory', 'proving'])
    for (const k of Object.values(F.kinds)) {
      expect(k.label.length).toBeGreaterThan(3)
      expect(k.does.length).toBeGreaterThan(20)
      expect(k.does).not.toMatch(/\bbås\b/i) // 11N: ordet "bås" används inte
    }
    expect(F.maxLevel).toBe(3)
    expect(F.linesPerLevel).toEqual([2, 4, 6])
  })
})

describe('startläget — linjerna bor i verk (11A)', () => {
  const state = createInitialState('indochina-slice', 'works-start')

  it('inga fristående linjer: house.lines finns inte, linjerna ligger i monteringsverket (startpaketet själv testas i construction.test.ts)', () => {
    expect('lines' in state.house).toBe(false)
    expect(assemblyWorks(state.house).map((w) => w.lines.length)).toEqual([2])
  })

  it('linjerna heter line-1, line-2 …, och findLine hittar dem i verken', () => {
    expect(allLines(state.house).map((l) => l.id)).toEqual(['line-1', 'line-2'])
    expect(findLine(state.house, 'line-2')?.id).toBe('line-2')
    expect(findLine(state.house, 'nope')).toBeUndefined()
  })

  it('verken har id, nivå, skick, bemanning, skicklighet och status — modellens fält', () => {
    for (const w of state.house.works) {
      expect(w.id).toMatch(/^works-\d+$/)
      expect(w.level).toBe(1)
      expect(w.condition).toBe(100)
      expect(w.staffing).toBe(100)
      expect(w.skill).toBeGreaterThanOrEqual(0)
      expect(w.status).toBe('operating')
    }
  })

  it('linjernas upphåll räknas per linje över alla verk; lönen är grundlönen så länge linjerna är högst fyra', () => {
    const b = computeFixedCostsBreakdown(state.house)
    const fixed = (balance as unknown as { fixedCosts: { lineUpkeep: number; payrollBase: number } }).fixedCosts
    expect(b.lineUpkeep).toBe(fixed.lineUpkeep * 2)
    expect(b.payroll).toBe(fixed.payrollBase)
  })
})

describe('kapacitet per nivå', () => {
  it('lineCapacity följer linesPerLevel, freeLineSlots räknar det som är ledigt', () => {
    const state = createInitialState('indochina-slice', 'works-cap')
    const works = state.house.works[0]!
    expect(lineCapacity(works)).toBe(2)
    expect(freeLineSlots(works)).toBe(0)
    works.level = 2
    expect(lineCapacity(works)).toBe(4)
    expect(freeLineSlots(works)).toBe(2)
    works.level = 3
    expect(lineCapacity(works)).toBe(6)
  })

  it('bara monteringsverk rymmer linjer', () => {
    const state = createInitialState('indochina-slice', 'works-cap-2')
    expect(assemblyWorks(state.house)).toHaveLength(1)
    expect(lineCapacity(state.house.works[1]!)).toBe(0) // laboratoriet
    expect(lineCapacity(state.house.works[2]!)).toBe(0) // ritkontoret
  })
})

describe('BUILD_LINE går in i ett verk med ledig plats', () => {
  it('startverket är fullt (nivå 1, två linjer): BUILD_LINE avvisas tills verket byggts ut', () => {
    const s = createInitialState('indochina-slice', 'works-build-0')
    expect(validateAction(s, s, BUILD)).toEqual({ ok: false, reason: 'no assembly works has a free line slot' })
  })

  it('lägger linjen i första verket med plats; ids fortsätter räkna över alla verk', () => {
    const s = createInitialState('indochina-slice', 'works-build')
    s.house.works[0]!.level = 2
    const next = turn(s, [BUILD]).state
    expect(allLines(next.house)).toHaveLength(3)
    expect(next.house.works[0]!.lines.map((l) => l.id)).toEqual(['line-1', 'line-2', 'line-3'])
  })

  it('det globala taket gäller fortfarande', () => {
    const t = createInitialState('indochina-slice', 'works-max')
    t.house.works[0]!.level = 3
    while (allLines(t.house).length < B.maxProductionLines) {
      t.house.works[0]!.lines.push(line(`line-${allLines(t.house).length + 1}`))
    }
    expect(validateAction(t, t, BUILD)).toEqual({ ok: false, reason: 'maximum production lines reached' })
  })
})

describe('migreringen (11K): linjer utan verk blir två verk', () => {
  it('fyra linjer blir två verk med två linjer var, i ordning', () => {
    const works = worksFromLines(['line-1', 'line-2', 'line-3', 'line-4'].map(line))
    expect(works.map((w) => w.id)).toEqual(['works-1', 'works-2'])
    expect(works.map((w) => w.lines.map((l) => l.id))).toEqual([['line-1', 'line-2'], ['line-3', 'line-4']])
    expect(works.every((w) => w.kind === 'assembly' && w.level === F.interimStartLevel)).toBe(true)
  })

  it('udda antal: första verket får den extra; en ensam linje ger ett verk; inga linjer ger två tomma verk', () => {
    expect(worksFromLines(['a', 'b', 'c', 'd', 'e'].map(line)).map((w) => w.lines.length)).toEqual([3, 2])
    expect(worksFromLines([line('a')]).map((w) => w.lines.length)).toEqual([1])
    expect(worksFromLines([]).map((w) => w.lines.length)).toEqual([0, 0])
  })

  it('en linje med status och uppdrag behåller dem (ingen tillståndsförlust)', () => {
    const busy: ProductionLine = { ...line('line-1'), status: 'running', assignedContractId: 'c-1', productId: 'm1_rifle' as ProductionLine['productId'] }
    const works = worksFromLines([busy, line('line-2')])
    expect(works[0]!.lines[0]).toEqual(busy)
  })
})
