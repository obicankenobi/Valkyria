// ledger-balance — P96 (ETAPP8_FORSLAG.md §3.1, skyddsräcke 1): "summan av kvartalets
// rader ska vara exakt lika med förändringen i house.treasury. Ett test underkänner
// varje tur där de skiljer sig med så mycket som en krona." Körs över 500 hela
// härnesspartier (125 frön × fyra policyer, samma upplägg som P75:s mätning) och
// prövar varje enskild tur. Ett penningflöde som går förbi huvudboken gör det här
// testet rött, med tur, policy och seed i felmeddelandet.
//
// checkTurn är själv testad nedan mot ett dopat tillstånd (kassa ändrad utan
// huvudboksrad) — ett balanstest som inte kan bli rött bevisar ingenting.
import { describe, expect, it } from 'vitest'
import { POLICIES } from '@seventh-front/harness/dist/policies.js'
import type { Policy } from '@seventh-front/harness/dist/policies.js'
import { createInitialState } from '../../src/state.js'
import { resolveTurn } from '../../src/resolve/index.js'
import { createRng } from '../../src/rng.js'
import { COMMODITIES } from '../../src/validateAction.js'
import type { FacilityKind, GameState, LedgerEntry, PlayerAction, StandingOrderChange, TurnSubmission } from '../../src/types.js'

const SCENARIO = 'indochina-slice'
const MAX_TURNS = 21 // samma tak som packages/harness/src/runGame.ts
const SEEDS_PER_POLICY = 125
const POLICY_NAMES = ['aggressive', 'balanced', 'passive', 'capacity'] as const

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, value) => total + value, 0)
}

function net(entry: LedgerEntry): number {
  return sum(entry.income) - sum(entry.expenses) + entry.financing.loans - entry.financing.repayments
}

// Returnerar alla brott mot huvudbokens invarianter för EN tur (prev → next).
export function checkTurn(prev: GameState, next: GameState): string[] {
  const problems: string[] = []
  const turn = prev.meta.turn
  const entry = next.ledger.find((e) => e.turn === turn)
  if (!entry) return [`ingen huvudboksrad för tur ${turn}`]

  if (next.ledger.length !== prev.ledger.length + 1) {
    problems.push(`huvudboken växte med ${next.ledger.length - prev.ledger.length} rader, väntade 1`)
  }
  const delta = next.house.treasury - prev.house.treasury
  if (net(entry) !== delta) {
    problems.push(`kassan ändrades ${delta} men huvudboken förklarar ${net(entry)} (diff ${delta - net(entry)})`)
  }
  if (entry.treasuryEnd !== next.house.treasury) problems.push(`treasuryEnd ${entry.treasuryEnd} ≠ kassa ${next.house.treasury}`)
  if (entry.debtEnd !== next.house.debt) problems.push(`debtEnd ${entry.debtEnd} ≠ skuld ${next.house.debt}`)
  if (entry.creditLimitEnd !== next.house.creditLimit) {
    problems.push(`creditLimitEnd ${entry.creditLimitEnd} ≠ creditLimit ${next.house.creditLimit}`)
  }
  const debtDelta = entry.financing.loans - entry.financing.repayments
  if (next.house.debt - prev.house.debt !== debtDelta) {
    problems.push(`skulden ändrades ${next.house.debt - prev.house.debt} men lån−återbetalningar är ${debtDelta}`)
  }
  for (const value of [...Object.values(entry.income), ...Object.values(entry.expenses), ...Object.values(entry.financing)]) {
    if (!Number.isInteger(value) || value < 0) problems.push(`ogiltigt belopp ${value} (heltal ≥ 0 krävs)`)
  }
  return problems
}

describe('huvudbokens balans (ETAPP8_FORSLAG.md §3.1)', () => {
  it('kontrollen kan bli röd: kassa ändrad utan huvudboksrad ger ett brott', () => {
    const prev = createInitialState(SCENARIO, 'ledger-check')
    const policy = POLICIES.balanced as Policy
    const next = resolveTurn(prev, policy(prev)).state
    expect(checkTurn(prev, next)).toEqual([])

    const tampered = structuredClone(next)
    tampered.house.treasury += 1 // ett flöde som går förbi huvudboken, en krona
    expect(checkTurn(prev, tampered)).toHaveLength(2) // kassan ≠ huvudboken, och treasuryEnd ≠ kassan
    expect(checkTurn(prev, tampered)[0]).toContain('diff 1')

    const debtTampered = structuredClone(next)
    debtTampered.house.debt += 5
    expect(checkTurn(prev, debtTampered).length).toBeGreaterThan(0)
  })

  it(
    `varje tur i ${SEEDS_PER_POLICY * POLICY_NAMES.length} hela partier (alla fyra policyer) balanserar exakt, och huvudboken har en rad per spelad tur`,
    () => {
      let games = 0
      let turnsChecked = 0
      const failures: string[] = []

      for (const policyName of POLICY_NAMES) {
        const policy = POLICIES[policyName] as Policy
        for (let i = 0; i < SEEDS_PER_POLICY; i++) {
          const seed = `p96-ledger:${policyName}:${i}`
          let state = createInitialState(SCENARIO, seed)
          let turnsPlayed = 0

          for (let t = 0; t < MAX_TURNS; t++) {
            if (state.status.kind === 'ended') break
            const prev = state
            state = resolveTurn(prev, policy(prev)).state
            turnsPlayed++
            turnsChecked++
            const problems = checkTurn(prev, state)
            if (problems.length > 0 && failures.length < 10) {
              failures.push(`${policyName} ${seed} tur ${prev.meta.turn}: ${problems.join('; ')}`)
            }
          }

          if (state.ledger.length !== turnsPlayed) {
            failures.push(`${policyName} ${seed}: ${state.ledger.length} huvudboksrader för ${turnsPlayed} spelade turer`)
          }
          games++
        }
      }

      expect(failures).toEqual([])
      expect(games).toBe(500)
      expect(turnsChecked).toBeGreaterThan(2000)
    },
    240_000,
  )
})

// ---------------------------------------------------------------------------
// Fuzz över ALLA verb. De fyra botpolicyerna ovan rör bara en bråkdel av
// penningflödena (mätt i P96: inga partier med REPAY, BUILD_LINE, HIRE, MARKET,
// BROKER eller krisvalen), så en läcka i just de grenarna hade inte fångats av de
// 500 botpartierna. Den här policyn skickar upp till fyra slumpade handlingar per
// tur ur ALLA penningflyttande verb, ovanpå `balanced`s bud (så kontrakt faktiskt
// tecknas och levereras). Många handlingar avvisas — det är meningen; det som
// godtas ska ändå balansera exakt. Slumpen är deterministisk (createRng).
function fuzzPolicy(state: GameState): TurnSubmission {
  const base = (POLICIES.balanced as Policy)(state)
  const rng = createRng(`${state.meta.seed}:fuzz`, state.meta.turn)
  const officials = Object.keys(state.officials)
  const stationIds = state.house.stations.map((st) => st.id)
  const factions = Object.keys(state.factions)
  const rivals = Object.keys(state.rivals)
  const commodities = COMMODITIES
  const spend = () => rng.pick([5000, 20000, 60000, 150000])

  const makers: (() => PlayerAction)[] = [
    () => ({ type: 'INTERNAL', op: 'TAKE_LOAN', payload: { amount: rng.pick([100000, 400000, 900000]) } }),
    () => ({ type: 'INTERNAL', op: 'REPAY', payload: { amount: rng.pick([50000, 200000, 500000]) } }),
    () => ({ type: 'INTERNAL', op: 'BUILD_LINE', payload: {} }),
    () => ({ type: 'INTERNAL', op: 'HIRE', payload: { role: rng.pick(['chiefOfStaff', 'chiefEngineer', 'chiefSalesman']) } }),
    () => ({ type: 'INTEL', op: 'EXPAND', stationId: rng.pick(stationIds) }),
    () => ({ type: 'INTEL', op: 'RECRUIT', stationId: rng.pick(stationIds), targetId: rng.pick(factions) }),
    () => ({ type: 'INTEL', op: 'LEAK', stationId: rng.pick(stationIds), targetId: rng.pick(rivals) }),
    () => ({ type: 'INTEL', op: 'SABOTAGE', stationId: rng.pick(stationIds), targetId: rng.pick(rivals) }),
    () => ({ type: 'INTEL', op: 'TURN', stationId: rng.pick(stationIds), targetId: rng.pick(officials) }),
    () => ({ type: 'MARKET', op: 'BUY_FORWARD', commodity: rng.pick(commodities), spend: spend() }),
    () => ({ type: 'MARKET', op: 'RELEASE', commodity: rng.pick(commodities), spend: spend() }),
    () => ({ type: 'POLITICAL', op: 'BRIBE', officialId: rng.pick(officials), spend: spend() }),
    () => ({ type: 'POLITICAL', op: 'FUND_CAMPAIGN', officialId: rng.pick(officials), spend: spend() }),
    () => ({ type: 'POLITICAL', op: 'STAGE_INCIDENT', targetFactionId: rng.pick(factions), spend: spend() }),
    () => ({ type: 'POLITICAL', op: 'BACK_CHANNEL', targetFactionId: rng.pick(factions), spend: spend() }),
    () => ({
      type: 'POLITICAL',
      op: 'INFLUENCE',
      targetFactionId: rng.pick(factions),
      spend: spend(),
      direction: rng.pick(['up', 'down'] as const),
      effect: { kind: 'publicSupport' },
    }),
    () => ({ type: 'POLITICAL', op: 'FUND_COUP', targetFactionId: rng.pick(factions), spend: spend() }),
    () => ({ type: 'POLITICAL', op: 'ASSASSINATE', officialId: rng.pick(officials), spend: spend() }),
    () => ({
      type: 'BROKER',
      buyerId: rng.pick(factions),
      productId: '105mm_field_gun',
      quantity: rng.int(5, 30),
      price: rng.pick([500000, 900000, 1500000]),
    }),
  ]

  const actions: PlayerAction[] = []
  if (state.pendingCrisis) actions.push({ type: 'CRISIS', choice: rng.pick(['PUSH', 'BACK_DOWN', 'SELL_THE_FILE'] as const) })
  for (let i = 0; i < 4; i++) actions.push(rng.pick(makers)())
  // P170: bygge, utbyggnad, avveckling och markköp är stående order — de skriver `expenses.works` och `income.facilitySale`, och en utbyggnad ger plats för BUILD_LINE.
  const workIds = state.house.works.map((w) => w.id)
  const kinds: FacilityKind[] = ['component', 'depot', 'proving', 'civil', 'assembly']
  const worksMakers: (() => StandingOrderChange)[] = [
    () => ({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: rng.pick(['armour', 'aviation', 'naval'] as const), forced: rng.int(0, 1) === 1 }),
    () => ({ kind: 'WORKS', op: 'BUILD', facilityKind: rng.pick(kinds.filter((k) => k !== 'assembly')) }),
    () => ({ kind: 'WORKS', op: 'EXPAND', facilityId: rng.pick(workIds), forced: rng.int(0, 1) === 1 }),
    () => ({ kind: 'WORKS', op: 'SELL', facilityId: rng.pick(workIds) }),
    () => ({ kind: 'WORKS', op: 'BUY_LAND' }),
  ]
  const standingOrders: StandingOrderChange[] = rng.int(0, 2) === 0 ? [rng.pick(worksMakers)()] : []
  return { standingOrders, bids: base.bids, actions }
}

describe('huvudbokens balans — fuzz över alla penningflyttande verb', () => {
  it(
    '200 partier med slumpade handlingar ur alla verb balanserar exakt varje tur, och varje huvudboksrad (utom clawback) skrivs i minst ett parti',
    () => {
      const failures: string[] = []
      const seen = new Set<string>()

      for (let i = 0; i < 200; i++) {
        const seed = `p96-fuzz:${i}`
        let state = createInitialState(SCENARIO, seed)
        state.house.creditLimit = 5_000_000 // lån ska gå att ta, så REPAY och ränta också kan inträffa
        for (const official of Object.values(state.officials)) official.relationToPlayer = 60 // BROKER kräver relation

        for (let t = 0; t < MAX_TURNS; t++) {
          if (state.status.kind === 'ended') break
          const prev = state
          state = resolveTurn(prev, fuzzPolicy(prev)).state
          const problems = checkTurn(prev, state)
          if (problems.length > 0 && failures.length < 10) failures.push(`${seed} tur ${prev.meta.turn}: ${problems.join('; ')}`)
        }

        for (const entry of state.ledger) {
          for (const [k, v] of Object.entries(entry.income)) if (v > 0) seen.add(`income.${k}`)
          for (const [k, v] of Object.entries(entry.expenses)) if (v > 0) seen.add(`expenses.${k}`)
          for (const [k, v] of Object.entries(entry.financing)) if (v > 0) seen.add(`financing.${k}`)
        }
      }

      expect(failures).toEqual([])
      // Täckningsbeviset: ett balanstest som aldrig rör en gren bevisar ingenting om den.
      // clawback kräver en kris OCH en restricted-leverans samma kvartal (mätt: nås inte
      // av fuzzen) och ligger därför bara i de riktade enhetstesterna. (Förskottsåterbetalningen
      // hamnar också på clawback — P98, se advance.test.ts.)
      const expectedRows = [
        'income.contracts',
        'income.advances',
        'income.broker',
        'income.commodityRelease',
        'income.fileSale',
        'income.facilitySale',
        'expenses.fixedCosts',
        'expenses.production',
        'expenses.interest',
        'expenses.political',
        'expenses.intel',
        'expenses.commodityPurchase',
        'expenses.hiring',
        'expenses.lines',
        'expenses.works',
        'expenses.retooling',
        'financing.loans',
        'financing.repayments',
      ]
      for (const row of expectedRows) expect(seen, `fuzzen nådde aldrig ${row}`).toContain(row)
    },
    240_000,
  )
})

