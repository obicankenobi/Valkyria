// handbookWorks.test.ts — P181 (ETAPP11_FORSLAG.md §8 punkt 8): handbokens uppslag "The Works" ska stämma med koden och datafilerna. Samma princip som handbookTruth.test.ts:
// siffrorna i uppslaget läses ur facilities.json, balance.json och kärnans egna konstanter, så ett ändrat tal fäller testet i stället för att uppslaget glider.
import { describe, expect, it } from 'vitest'
import { FACILITY_DATA, OUTSOURCE_SHARES, STAFFING_STEPS, createInitialState, worksSite } from '@seventh-front/core'
import facilities from '../../core/src/data/facilities.json'
import balance from '../../core/src/data/balance.json'
import { HANDBOOK } from '../src/handbook.js'

const entry = HANDBOOK.find((e) => e.id === 'works')!
const text = [entry.summary, ...entry.body].join(' ')
const money = (n: number) => `£${n.toLocaleString('en-GB')}`
const F = facilities as unknown as { forceTimeFactor: number; forceCostFactor: number; linesPerLevel: number[]; plot: { slots: number; landSlots: number; landCost: number } }
const B = balance as unknown as { strikeMoraleThreshold: number; planMaxContracts: number }

describe('handboken om verken stämmer med koden (P181)', () => {
  it('tomten: åtta platser, markköpets pris och antal platser står som i datafilen och i startläget', () => {
    expect(F.plot.slots).toBe(8)
    expect(worksSite(createInitialState('indochina-slice', 'handbook-works')).slots).toBe(F.plot.slots)
    expect(text).toMatch(/eight places/)
    expect(text).toContain(`${money(F.plot.landCost)} once and adds four places`)
    expect(F.plot.landSlots).toBe(4)
  })

  it('ett forcerat bygge är halva tiden mot dubbla priset', () => {
    expect(F.forceTimeFactor).toBe(0.5)
    expect(F.forceCostFactor).toBe(2)
    expect(text).toMatch(/forced build takes half the time and costs double/)
  })

  it('ett monteringsverk rymmer två, fyra och sex linjer', () => {
    expect(F.linesPerLevel).toEqual([2, 4, 6])
    expect(FACILITY_DATA.maxLevel).toBe(3)
    expect(text).toMatch(/two production lines on level 1, four on level 2 and six on level 3/)
  })

  it('bemanningen går i steg om 25, 50, 75 och 100 procent, och en strejk kan bryta ut under moralen 35', () => {
    expect([...STAFFING_STEPS]).toEqual([25, 50, 75, 100])
    expect(text).toMatch(/25, 50, 75 or 100 percent/)
    expect(B.strikeMoraleThreshold).toBe(35)
    expect(text).toMatch(/Below 35 morale a strike can break out/)
  })

  it('utläggning sker i steg om 25, 50, 75 och 100 procent', () => {
    expect([...OUTSOURCE_SHARES]).toEqual([25, 50, 75, 100])
    expect(text).toMatch(/\(25, 50, 75 or 100 percent\) to a subcontractor/)
  })

  it('produktionstavlan visar sex kvartal (uppslaget säger det)', () => {
    expect(text).toMatch(/next six quarters/)
    expect(B.planMaxContracts).toBeGreaterThanOrEqual(6)
  })

  it('uppslaget nämner de fyra lådorna i THE COMPANY med de namn gränssnittet har', () => {
    for (const drawer of ['Works', 'Drawing office', 'Books', 'Legal']) expect(text).toContain(drawer)
  })
})
