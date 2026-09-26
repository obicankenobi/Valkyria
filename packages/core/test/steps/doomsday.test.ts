import { describe, expect, it } from 'vitest'
import { doomsday } from '../../src/resolve/steps/doomsday.js'
import { createRng } from '../../src/rng.js'
import { createInitialState } from '../../src/state.js'
import balance from '../../src/data/balance.json' with { type: 'json' }
import type { ResolveContext } from '../../src/resolve/index.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function makeCtx(state: GameState, seed: string): { ctx: ResolveContext; emitted: Omit<WireEvent, 'id' | 'turn'>[] } {
  const emitted: Omit<WireEvent, 'id' | 'turn'>[] = []
  let seq = 0
  const ctx: ResolveContext = {
    state,
    draft: state,
    submission: EMPTY_SUBMISSION,
    rng: createRng(seed, 0),
    emit: (e) => {
      emitted.push(e)
      return `test-${seq++}`
    },
    rejected: [],
  }
  return { ctx, emitted }
}

describe('doomsday (isolerat steg, spec avsnitt 5 "Doomsday")', () => {
  it('avklingar med doomsdayDecayPerTurn per tur när ingen teater eskalerar', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = 50
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0 // under tröskeln — ingen eskalering möjlig

    doomsday(makeCtx(state, 'decay-seed').ctx)

    expect(state.doomsday).toBe(50 - balance.doomsdayDecayPerTurn)
  })

  it('doomsday klamras aldrig under 0', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = 1
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0

    doomsday(makeCtx(state, 'decay-seed').ctx)

    expect(state.doomsday).toBe(0)
  })

  it('(P7 klart-när, driver 4) heat över heatEscalationThreshold kan eskalera doomsday, med causeId till eskaleringshändelsen', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = 20
    const theatre = state.theatres['indochina']!
    theatre.heat = 90 // över tröskeln (85)

    // Deterministisk sökning: prova seeds tills en hittas där chance(15%) slår in
    // OCH eskaleringsbeloppet faktiskt syns i utfallet. Källan är fortfarande
    // createRng — ingen Math.random (CLAUDE.md hård regel 2).
    let found = false
    for (let i = 0; i < 500 && !found; i++) {
      const trial = createInitialState('indochina-slice', 'seed')
      trial.doomsday = 20
      trial.theatres['indochina']!.heat = 90

      const { ctx, emitted } = makeCtx(trial, `escalation-seed-${i}`)
      doomsday(ctx)

      const escalationEvent = emitted.find((e) => e.headline.includes('ESCALATES'))
      if (!escalationEvent) continue

      found = true
      const doomsdayEvent = emitted.find((e) => e.headline.startsWith('DOOMSDAY') && e.causeId !== null)
      expect(doomsdayEvent).toBeDefined()
      expect(trial.doomsday).toBeGreaterThan(20 - balance.doomsdayDecayPerTurn)
    }

    expect(found).toBe(true)
  })

  it('(P7 klart-när) ingen annan fil än doomsdayGate.ts skriver till state.doomsday — verifieras indirekt: upprepade avklingningsturer utan eskalering ger exakt den förväntade, ackumulerade nedgången', () => {
    const state = createInitialState('indochina-slice', 'seed')
    // Under doomsdayCrisisEventThreshold hela vägen (annars griper krishändelsens
    // egen, separat testade BACK DOWN-logik in och stör den här räkningen).
    state.doomsday = 50
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0

    for (let i = 0; i < 5; i++) {
      doomsday(makeCtx(state, `decay-seed-${i}`).ctx)
    }

    expect(state.doomsday).toBe(50 - 5 * balance.doomsdayDecayPerTurn)
  })

  it('CRISIS WATCH emittas vid uppåtgående korsning av doomsdayCrisisWatchThreshold, inte vid nedåtgående', () => {
    // Nedåtgående (avklingning över tröskeln): ingen CRISIS WATCH.
    const downState = createInitialState('indochina-slice', 'seed')
    downState.doomsday = balance.doomsdayCrisisWatchThreshold + 1
    for (const theatre of Object.values(downState.theatres)) theatre.heat = 0
    const { emitted: downEmitted } = makeCtx(downState, 'watch-seed')
    doomsday(makeCtx(downState, 'watch-seed').ctx)
    expect(downEmitted.some((e) => e.headline.includes('CRISIS WATCH'))).toBe(false)

    // Uppåtgående korsning via eskalering: sök fram ett seed som ger en tillräcklig
    // eskalering för att faktiskt korsa tröskeln uppåt.
    let found = false
    for (let i = 0; i < 500 && !found; i++) {
      const trial = createInitialState('indochina-slice', 'seed')
      trial.doomsday = balance.doomsdayCrisisWatchThreshold - balance.doomsdayDecayPerTurn - 1
      trial.theatres['indochina']!.heat = 90

      const { ctx, emitted } = makeCtx(trial, `watch-cross-seed-${i}`)
      doomsday(ctx)

      if (emitted.some((e) => e.headline.includes('CRISIS WATCH'))) {
        found = true
        expect(trial.doomsday).toBeGreaterThanOrEqual(balance.doomsdayCrisisWatchThreshold)
      }
    }
    expect(found).toBe(true)
  })

  it('(P20 klart-när, DESIGN.md §6.2) krisevent vid doomsdayCrisisEventThreshold flaggar pendingCrisis och väntar — löser INTE krisen själv', () => {
    const state = createInitialState('indochina-slice', 'seed')
    // Måste ligga tillräckligt högt för att fortfarande vara >= tröskeln EFTER
    // stegets egen avklingning (doomsdayDecayPerTurn dras alltid av först).
    state.doomsday = balance.doomsdayCrisisEventThreshold + balance.doomsdayDecayPerTurn + 5
    state.meta.turn = 7
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0 // ingen eskalering ska störa mätningen
    const exposureBefore = state.house.exposureEvents.length
    const doomsdayBeforeStep = state.doomsday
    state.market.restrictedRevenueThisTurn = 12345

    const { ctx, emitted } = makeCtx(state, 'crisis-seed')
    doomsday(ctx)

    const crisisEvent = emitted.find((e) => e.headline.startsWith('CRISIS —'))
    expect(crisisEvent).toBeDefined()
    expect(crisisEvent!.headline).toContain('AWAITING YOUR CHOICE')

    // Ingen BACK DOWN-lösning längre — det tvåstegsflöde avsnitt 9.3 beskriver
    // (flagga här, lös i applyActions.ts nästa resolveTurn-anrop).
    expect(emitted.some((e) => e.headline.includes('BACK DOWN'))).toBe(false)
    expect(state.doomsday).toBe(doomsdayBeforeStep - balance.doomsdayDecayPerTurn)
    expect(state.house.exposureEvents.length).toBe(exposureBefore) // ingen station bränns här

    expect(state.pendingCrisis).not.toBeNull()
    expect(state.pendingCrisis!.turn).toBe(7)
    expect(state.pendingCrisis!.restrictedRevenueThisTurn).toBe(12345)
    expect(Object.keys(state.theatres)).toContain(state.pendingCrisis!.theatreId)
  })

  it('flagCrisisEvent flaggar bara en gång — ett redan satt pendingCrisis skrivs inte över samma tur', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = balance.doomsdayCrisisEventThreshold + balance.doomsdayDecayPerTurn + 5
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0
    state.pendingCrisis = { turn: 3, theatreId: 'indochina', restrictedRevenueThisTurn: 999 }

    const { ctx, emitted } = makeCtx(state, 'crisis-seed-2')
    doomsday(ctx)

    expect(emitted.some((e) => e.headline.startsWith('CRISIS —'))).toBe(false)
    expect(state.pendingCrisis).toEqual({ turn: 3, theatreId: 'indochina', restrictedRevenueThisTurn: 999 })
  })

  it('krisevent triggas inte under doomsdayCrisisEventThreshold', () => {
    const state = createInitialState('indochina-slice', 'seed')
    state.doomsday = balance.doomsdayCrisisEventThreshold - balance.doomsdayDecayPerTurn - 1
    for (const theatre of Object.values(state.theatres)) theatre.heat = 0

    const { ctx, emitted } = makeCtx(state, 'no-crisis-seed')
    doomsday(ctx)

    expect(emitted.some((e) => e.headline.startsWith('CRISIS —'))).toBe(false)
  })
})
