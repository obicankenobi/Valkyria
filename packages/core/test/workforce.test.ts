// workforce.test.ts — P173 (ETAPP11_FORSLAG.md §3 11D, §5.1): arbetsstyrkan — bemanning, skicklighet, löner, uppsägning och strejk.
import { describe, expect, it } from 'vitest'
import balance from '../src/data/balance.json' with { type: 'json' }
import { createInitialState } from '../src/state.js'
import { resolveTurn } from '../src/resolve/index.js'
import { computeFixedCostsBreakdown, totalFixedCosts } from '../src/resolve/steps/economy.js'
import { computeLineThroughput } from '../src/resolve/steps/production.js'
import { getProduct } from '../src/pricing.js'
import { facilityWage, moraleOf, totalWages, validateWorkforceChange, wageIndexOf, workforceSpeedFactor } from '../src/workforce.js'
import type { GameState, StandingOrderChange } from '../src/types.js'

const B = balance as unknown as Record<string, number> & Record<'wageDoomsdaySlope' | 'wageIndexMax' | 'skillGrowthPerTurn' | 'skillThroughputSlope' | 'moraleBaseline' | 'moraleRecoveryPerTurn' | 'moraleOvertimePenalty' | 'strikeMaxTurns' | 'strikeEndMorale' | 'strikeConcessionPremiumPct' | 'strikeBreakIntegrityPenalty', number>
const turn = (s: GameState, standingOrders: StandingOrderChange[] = []) => resolveTurn(s, { standingOrders, bids: [], actions: [] })
const fresh = (seed: string) => createInitialState('indochina-slice', seed)
const hasText = (r: ReturnType<typeof turn>, text: string) => r.wire.some((e) => e.headline.includes(text))

describe('lönen (P173)', () => {
  it('startpaketet kostar lika mycket som före P173: lönen för monteringsverket nivå 1 är exakt vad payrollBase sänktes med', () => {
    const s = fresh('wf-start')
    const b = computeFixedCostsBreakdown(s.house, 0)
    expect(b.wages).toBe(60_000)
    expect(totalFixedCosts(b)).toBe(348_000)
  })

  it('lönen skalas med bemanningen, löneindexet och ett lönepåslag; ingen lön under bygge eller strejk', () => {
    const s = fresh('wf-wage')
    const w = s.house.works[0]!
    expect(facilityWage(w, 1)).toBe(60_000)
    expect(facilityWage({ ...w, staffing: 50 }, 1)).toBe(30_000)
    expect(facilityWage(w, 1.5)).toBe(90_000)
    expect(facilityWage({ ...w, wagePremiumPct: 10 }, 1)).toBe(66_000)
    expect(facilityWage({ ...w, status: 'strike' }, 1)).toBe(0)
    expect(facilityWage({ ...w, status: 'under_construction' }, 1)).toBe(0)
    expect(totalWages(s.house)).toBe(60_000) // laboratoriet och ritkontoret har ingen lön förrän P176
  })

  it('löneindexet följer doomsday och har ett tak; en rubrik när det rört sig', () => {
    let s = fresh('wf-index')
    s.doomsday = 40
    const r = turn(s)
    expect(wageIndexOf(r.state.house)).toBeCloseTo(1 + B.wageDoomsdaySlope * 40, 6)
    expect(hasText(r, 'WAGES RISE')).toBe(true)
    s = fresh('wf-index2')
    s.doomsday = 100
    expect(wageIndexOf(turn(s).state.house)).toBeLessThanOrEqual(B.wageIndexMax)
  })
})

describe('bemanning och skicklighet (P173)', () => {
  it('att anställa tar ett kvartal och späder ut skickligheten, som sedan växer', () => {
    const s = fresh('wf-hire')
    s.house.works[0]!.staffing = 50
    s.house.works[0]!.skill = 70
    const given = turn(s, [{ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-1', staffing: 100 }])
    expect(given.state.house.works[0]!.staffing).toBe(50) // inte förrän nästa kvartal
    expect(given.state.house.standingOrders.workforce?.['works-1']).toMatchObject({ staffing: 100 })
    const next = turn(given.state)
    const w = next.state.house.works[0]!
    expect(w.staffing).toBe(100)
    // Första turen växer skickligheten (70 → 72); anställningen gäller nästa kvartal: 72 × 50/100 + 20 × 50/100 = 46, sedan växer den igen samma tur
    expect(w.skill).toBe(46 + B.skillGrowthPerTurn)
    expect(next.state.house.standingOrders.workforce?.['works-1']).toBeUndefined()
    expect(hasText(next, 'HIRES UP TO 100%')).toBe(true)
  })

  it('en uppsägning sparar lön, tar skicklighet med sig och sänker stämningen på de andra anläggningarna', () => {
    const s = fresh('wf-layoff')
    // Ett andra verk med en arbetsstyrka, så att "de andra" finns.
    s.house.works.push({ ...structuredClone(s.house.works[0]!), id: 'works-9', lines: [] })
    const wageBefore = totalWages(s.house)
    const given = turn(s, [{ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-1', staffing: 50 }])
    const next = turn(given.state)
    const [a, b] = [next.state.house.works[0]!, next.state.house.works[next.state.house.works.length - 1]!]
    expect(a.staffing).toBe(50)
    expect(a.skill).toBeLessThan(50)
    expect(totalWages(next.state.house)).toBeLessThan(wageBefore)
    expect(moraleOf(a)).toBeLessThan(B.moraleBaseline)
    expect(moraleOf(b)).toBeLessThan(B.moraleBaseline)
    expect(moraleOf(a)).toBeLessThan(moraleOf(b)) // verket själv tar hårdare stryk
    expect(hasText(next, 'LAYS OFF')).toBe(true)
  })

  it('genomströmningen följer bemanning och skicklighet (skicklighet 50 är neutral) och är noll i en strejk', () => {
    const s = fresh('wf-speed')
    const w = s.house.works[0]!
    const line = w.lines[0]!
    const product = getProduct('m1_rifle')
    const base = computeLineThroughput(s.house, line, product)
    w.staffing = 50
    expect(computeLineThroughput(s.house, line, product)).toBeCloseTo(base / 2, 9)
    w.staffing = 100
    w.skill = 100
    expect(workforceSpeedFactor(s.house, line.id)).toBeCloseTo(1 + B.skillThroughputSlope, 9)
    w.status = 'strike'
    expect(computeLineThroughput(s.house, line, product)).toBe(0)
  })

  it('valideringen: okänd anläggning, slag utan arbetsstyrka, fel steg, redan på målet, strejk', () => {
    const s = fresh('wf-validate')
    const check = (c: Extract<StandingOrderChange, { kind: 'WORKFORCE' }>) => validateWorkforceChange(s, c)
    expect(check({ kind: 'WORKFORCE', op: 'SET', facilityId: 'nope', staffing: 50 })).toMatchObject({ ok: false })
    expect(check({ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-2', staffing: 50 })).toMatchObject({ ok: false, reason: expect.stringContaining('no workforce') })
    expect(check({ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-1', staffing: 60 })).toMatchObject({ ok: false, reason: expect.stringContaining('25, 50, 75, 100') })
    expect(check({ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-1', staffing: 100 })).toMatchObject({ ok: false, reason: expect.stringContaining('already') })
    expect(check({ kind: 'WORKFORCE', op: 'SET', facilityId: 'works-1', staffing: 75 })).toEqual({ ok: true })
    expect(check({ kind: 'WORKFORCE', op: 'STRIKE', facilityId: 'works-1', response: 'break' })).toMatchObject({ ok: false, reason: expect.stringContaining('not on strike') })
  })
})

describe('stämning och strejk (P173)', () => {
  it('stämningen återhämtar sig mot grundnivån; övertid drar ner den', () => {
    const s = fresh('wf-morale')
    s.house.works[0]!.morale = 50
    expect(moraleOf(turn(s).state.house.works[0]!)).toBe(50 + B.moraleRecoveryPerTurn)
    const t = fresh('wf-morale-ot')
    t.house.standingOrders.lines[t.house.works[0]!.lines[0]!.id] = { category: null, shift: 'overtime', sinceTurn: 0 }
    expect(moraleOf(turn(t).state.house.works[0]!)).toBe(B.moraleBaseline - B.moraleOvertimePenalty)
  })

  it('ett lugnt hus drar aldrig ur slumpen för strejker', () => {
    const s = fresh('wf-calm')
    const before = s.meta.rngCursor
    const a = turn(s)
    const b = turn(fresh('wf-calm'))
    expect(a.state.meta.rngCursor).toBe(b.state.meta.rngCursor)
    expect(before).toBe(0)
    expect(a.state.house.works[0]!.status).toBe('operating')
  })

  it('under tröskeln kan en strejk bryta ut: linjerna står, verket tar inga kontrakt och drar ingen lön', () => {
    let struck: GameState | null = null
    for (let i = 0; i < 40 && !struck; i++) {
      const s = fresh(`wf-strike-${i}`)
      s.house.works[0]!.morale = 5
      const r = turn(s)
      if (r.state.house.works[0]!.status === 'strike') struck = r.state
    }
    expect(struck).not.toBeNull()
    const w = struck!.house.works[0]!
    expect(w.strike).toBeDefined()
    expect(totalWages(struck!.house)).toBe(0)
    expect(workforceSpeedFactor(struck!.house, w.lines[0]!.id)).toBe(0)
  })

  function struckState(): GameState {
    for (let i = 0; i < 80; i++) {
      const s = fresh(`wf-struck-${i}`)
      s.house.works[0]!.morale = 5
      const r = turn(s)
      if (r.state.house.works[0]!.status === 'strike') return r.state
    }
    throw new Error('no strike produced')
  }

  it('att ge med sig: pengar nu, lönepåslag för alltid, strejken över', () => {
    const s = struckState()
    const treasury = s.house.treasury
    const r = turn(s, [{ kind: 'WORKFORCE', op: 'STRIKE', facilityId: 'works-1', response: 'concede' }])
    const w = r.state.house.works[0]!
    expect(w.status).toBe('operating')
    expect(w.wagePremiumPct).toBe(B.strikeConcessionPremiumPct)
    expect(r.state.house.treasury).toBeLessThan(treasury)
    expect(hasText(r, 'GIVES IN')).toBe(true)
  })

  it('att bryta den: stämning och redbarhet tar skada, strejken över', () => {
    const s = struckState()
    const integrity = s.house.reputation.integrity
    const r = turn(s, [{ kind: 'WORKFORCE', op: 'STRIKE', facilityId: 'works-1', response: 'break' }])
    expect(r.state.house.works[0]!.status).toBe('operating')
    expect(r.state.house.reputation.integrity).toBe(integrity - B.strikeBreakIntegrityPenalty)
    expect(hasText(r, 'BREAKS THE STRIKE')).toBe(true)
  })

  it('att vänta ut den: en strejk tar slut av sig själv efter strikeMaxTurns', () => {
    let s = struckState()
    s.house.works[0]!.morale = 100 // inga nya strejker att störa räkningen
    for (let i = 0; i < B.strikeMaxTurns + 1 && s.house.works[0]!.status === 'strike'; i++) s = turn(s).state
    expect(s.house.works[0]!.status).toBe('operating')
    expect(moraleOf(s.house.works[0]!)).toBeGreaterThanOrEqual(B.strikeEndMorale)
  })

  it('kontrakt väntar ut en strejk i stället för att läggas ut automatiskt', () => {
    const s = struckState()
    expect(s.house.works[0]!.status).toBe('strike')
    // canBuildHere räknar ett verk i strejk som ett verk som kan bygga (outsourcing.ts) — annars skulle varje kontrakt läggas ut för gott.
    const r = turn(s)
    expect(r.wire.some((e) => e.headline.includes('NO WORKS CAN BUILD'))).toBe(false)
  })
})
