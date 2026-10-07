// facilityCard.test.ts — P179 (ETAPP11_FORSLAG.md §8): kortet och byggmenyn läser kärnans egna tal.
import { describe, expect, it } from 'vitest'
import facilities from '../src/data/facilities.json' with { type: 'json' }
import { facilityCard, worksAbroadOptions, worksBuildOptions, worksSite } from '../src/facilityCard.js'
import { planBuild } from '../src/construction.js'
import { createInitialState } from '../src/state.js'
import { totalFixedCosts } from '../src/index.js'
import { computeFixedCostsBreakdown } from '../src/resolve/steps/economy.js'
import type { FacilityKind } from '../src/types.js'

const F = facilities as unknown as { kinds: Record<FacilityKind, { label: string; does: string; buildCost: number[]; buildTurns: number[]; maxCount: number }> }
const fresh = () => createInitialState('indochina-slice', 'facility-card')

describe('facilityCard (P179)', () => {
  it('ger ett kort för varje anläggning i startpaketet, med datafilens mening, nivå och driftstatus', () => {
    const state = fresh()
    for (const w of state.house.works) {
      const card = facilityCard(state, w.id)!
      expect(card.kind).toBe(w.kind)
      expect(card.does).toBe(F.kinds[w.kind].does)
      expect(card.label).toBe(F.kinds[w.kind].label)
      expect(card.level).toBe(w.level)
      expect(card.activity.length).toBeGreaterThan(0)
    }
    expect(facilityCard(state, 'works-nope')).toBeNull()
  })

  it('bara monteringsverk har skick och underhåll; bara anläggningar med löner har bemanning', () => {
    const state = fresh()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    const lab = state.house.works.find((w) => w.kind === 'laboratory')!
    const a = facilityCard(state, assembly.id)!
    expect(a.condition).toBe(assembly.condition)
    expect(a.maintenance).toBe('normal')
    expect(a.staffing?.current).toBe(assembly.staffing)
    const l = facilityCard(state, lab.id)!
    expect(l.condition).toBeNull()
    expect(l.maintenance).toBeNull()
    expect(l.staffing).toBeNull()
  })

  it('den fasta kostnaden är exakt den kärnan räknar med (summan över korten = anläggningsposten)', () => {
    const state = fresh()
    const sum = state.house.works.reduce((s, w) => s + facilityCard(state, w.id)!.fixedCost, 0)
    expect(sum).toBe(computeFixedCostsBreakdown(state.house).facilityUpkeep)
    expect(totalFixedCosts(computeFixedCostsBreakdown(state.house))).toBeGreaterThan(sum)
  })

  it('nästa nivå visar kärnans byggplan, och högsta nivån visar ingen', () => {
    const state = fresh()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    const card = facilityCard(state, assembly.id)!
    const plan = planBuild('assembly', (assembly.level + 1) as 2 | 3, false)
    expect(card.next).toMatchObject({ level: assembly.level + 1, cost: plan.costTotal, turns: plan.turnsTotal })
    expect(card.next!.gives).toMatch(/production lines/)
    const top = { ...state, house: { ...state.house, works: state.house.works.map((w) => (w.id === assembly.id ? { ...w, level: 3 as const } : w)) } }
    expect(facilityCard(top, assembly.id)!.next).toBeNull()
  })

  it('ett bygge visar lampan "building" och sin takt', () => {
    const state = fresh()
    const lab = state.house.works.find((w) => w.kind === 'laboratory')!
    const building = { ...state, house: { ...state.house, works: state.house.works.map((w) => (w.id === lab.id ? { ...w, status: 'under_construction' as const, build: { toLevel: 1 as const, startTurn: 1, turnsTotal: 3, turnsLeft: 2, costTotal: 900000, costPerTurn: 300000, forced: false } } : w)) } }
    const card = facilityCard(building, lab.id)!
    expect(card.lamp).toBe('building')
    expect(card.build).toMatchObject({ turnsLeft: 2, turnsTotal: 3, costPerTurn: 300000 })
    expect(card.next).toBeNull()
  })

  it('en strejk ger lampan "standing"', () => {
    const state = fresh()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    const struck = { ...state, house: { ...state.house, works: state.house.works.map((w) => (w.id === assembly.id ? { ...w, status: 'strike' as const } : w)) } }
    expect(facilityCard(struck, assembly.id)!.lamp).toBe('standing')
  })
})

describe('worksBuildOptions / worksSite (P179)', () => {
  it('ett val per slag med datafilens pris och byggtid; forcerat är halva tiden mot dubbla priset', () => {
    const state = fresh()
    const options = worksBuildOptions(state)
    expect(options.map((o) => o.kind).sort()).toEqual(Object.keys(F.kinds).sort())
    for (const o of options) {
      expect(o.cost).toBe(F.kinds[o.kind].buildCost[0])
      expect(o.turns).toBe(F.kinds[o.kind].buildTurns[0])
      expect(o.forcedCost).toBe(o.cost * 2)
      expect(o.forcedTurns).toBeLessThanOrEqual(Math.ceil(o.turns / 2))
    }
  })

  it('skälen kommer ur kärnans kontroll: ett ritkontor går inte att bygga två av, och ett labb finns redan i startkategorin', () => {
    const state = fresh()
    const options = worksBuildOptions(state)
    const design = options.find((o) => o.kind === 'design')!
    expect(design.blockedReason).toMatch(/most/)
    const lab = options.find((o) => o.kind === 'laboratory')!
    expect(lab.needsCategory).toBe(true)
    expect(lab.blockedReason).toBeNull() // fem kategorier är fria
    expect(lab.categories.filter((c) => c.blockedReason !== null)).toHaveLength(1)
    expect(options.find((o) => o.kind === 'assembly')!.categories).toHaveLength(6)
  })

  it('en full tomt blockerar varje byggval med skälet "the plot is full"', () => {
    const state = fresh()
    const filler = Array.from({ length: 8 - state.house.works.length }, (_, i) => ({ ...state.house.works[0]!, id: `works-f${i}`, lines: [] }))
    const full = { ...state, house: { ...state.house, works: [...state.house.works, ...filler] } }
    for (const o of worksBuildOptions(full)) {
      const reason = o.blockedReason ?? o.categories[0]?.blockedReason
      expect(reason, o.kind).toBe('the plot is full')
    }
    expect(worksSite(full).homeWorks).toHaveLength(8)
  })

  it('tomten: åtta platser, markköpet och verk utomlands', () => {
    const state = fresh()
    const site = worksSite(state)
    expect(site.slots).toBe(8)
    expect(site.landBought).toBe(false)
    expect(site.landSlots).toBe(4)
    expect(site.abroad).toEqual([])
    expect(worksAbroadOptions(state).map((o) => o.factionId).sort()).toEqual(['laos', 'rvn'])
    for (const o of worksAbroadOptions(state)) expect(o.blockedReason === null || typeof o.blockedReason === 'string').toBe(true)
  })
})
