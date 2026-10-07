// runInShare.test.ts — P186 (ETAPP11_FORSLAG.md §9, raden "andel av styckkostnadens fall som kommer av inkörning i en serie på åtta kvartal", 15–30 %): mätaren följer varje linje som bygger samma produkt
// kvartal efter kvartal, och för en serie på minst åtta kvartal jämförs styckkostnadens fall (första mot sista kvartalet) med det inkörningen själv stod för — resten är råvaruindexets rörelse.
import { describe, expect, it } from 'vitest'
import { allLines, createInitialState, getProduct } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { RunInTracker, shareOfFall } from '../src/runInShare.js'

const SERIES = 8

function producing(state: GameState, runIn: number): GameState {
  const line = allLines(state.house)[0]!
  line.productId = 'm1_rifle'
  line.assignedContractId = 'contract-x'
  line.status = 'running'
  line.runIn = runIn
  line.tooling = { productId: 'm1_rifle', designId: null }
  return state
}

describe('shareOfFall', () => {
  it('summerar inkörningens del av fallet över serier med ett positivt fall, och ignorerar serier där kostnaden steg', () => {
    expect(shareOfFall([{ total: 10, runIn: 10 }])).toBe(100)
    expect(shareOfFall([{ total: 10, runIn: 2 }, { total: 30, runIn: 6 }])).toBeCloseTo(20, 9)
    expect(shareOfFall([{ total: 10, runIn: 2 }, { total: -5, runIn: 1 }])).toBeCloseTo(20, 9)
    expect(shareOfFall([])).toBe(0)
  })
})

describe('RunInTracker', () => {
  it('en serie på åtta kvartal utan råvarurörelse: hela fallet kommer av inkörning, och serien räknas', () => {
    const state = createInitialState('indochina-slice', 'run-in-share')
    const tracker = new RunInTracker()
    const rate = getProduct('m1_rifle').unitsPerLineTurn
    for (let t = 0; t < SERIES; t++) {
      producing(state, rate * t)
      tracker.observe(state)
    }
    const result = tracker.finish()
    expect(result.series).toBe(1)
    expect(result.sharePct).toBeCloseTo(100, 6)
  })

  it('en kortare serie än åtta kvartal räknas inte', () => {
    const state = createInitialState('indochina-slice', 'run-in-short')
    const tracker = new RunInTracker()
    for (let t = 0; t < SERIES - 1; t++) {
      producing(state, 4000 * t)
      tracker.observe(state)
    }
    expect(tracker.finish()).toEqual({ series: 0, sharePct: 0 })
  })

  it('stiger råvarupriserna under serien äts en del av fallet upp: inkörningens andel blir större än hela, och räknas ändå bara mot det totala fallet', () => {
    const state = createInitialState('indochina-slice', 'run-in-drift')
    const tracker = new RunInTracker()
    for (let t = 0; t < SERIES; t++) {
      producing(state, 4000 * t)
      for (const key of Object.keys(state.market.commodities) as (keyof typeof state.market.commodities)[]) state.market.commodities[key] = state.market.commodities[key] * 0.98 // råvarorna faller också
      tracker.observe(state)
    }
    const result = tracker.finish()
    expect(result.series).toBe(1)
    expect(result.sharePct).toBeGreaterThan(0)
    expect(result.sharePct).toBeLessThan(100)
  })

  it('byter linjen produkt bryts serien; en ny börjar om', () => {
    const state = createInitialState('indochina-slice', 'run-in-switch')
    const tracker = new RunInTracker()
    for (let t = 0; t < SERIES - 2; t++) {
      producing(state, 4000 * t)
      tracker.observe(state)
    }
    const line = allLines(state.house)[0]!
    line.productId = '105mm_field_gun'
    line.tooling = { productId: '105mm_field_gun', designId: null }
    line.runIn = 0
    for (let t = 0; t < 3; t++) tracker.observe(state)
    expect(tracker.finish().series).toBe(0)
  })
})
