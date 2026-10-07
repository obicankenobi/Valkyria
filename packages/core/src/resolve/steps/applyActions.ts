// applyActions — spelarens handlingar och bud, i inskickad ordning (spec 3.1).
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10 och ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.
//
// P17 byggde house.actionPoints (8.1) och INTERNAL i sin helhet (8.2). P18 byggde
// två av tre POLITICAL-op (BRIBE, STAGE_INCIDENT, BACK_CHANNEL — FUND_COUP förblir
// etapp 2) och en minimal INTEL (EXPAND, RECRUIT, WITHDRAW — LEAK/SABOTAGE/TURN är
// medvetna no-ops, avvisade med 'not implemented in this stage', avsnitt 8.4).
// BROKER och MARKET förblev helt obyggda i etapp 1,5 — ingen prompt i avsnitt
// 10 ägde dem där. P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5) bygger MARKET
// (BUY_FORWARD/RELEASE). P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.5) bygger BROKER
// — den sista tysta grenen, se filens slut.
//
// P20 bygger CRISIS (avsnitt 9). Till skillnad från alla andra PlayerAction-typer
// KOSTAR den ingen actionPoint (krisen är inte valfri) och hanteras därför i en
// egen, separat gren INNAN handlingstaksloopen — se resolvePendingCrisis. Krisen
// FLAGGAS av doomsday.ts (som sätter draft.pendingCrisis) en tur, och LÖSES här,
// i nästa tur — den ordningen faller ut naturligt ur pipelinens fasta sekvens
// (applyActions kör FÖRST, doomsday.ts SENARE, samma passage) utan någon särskild
// kod för att skjuta upp det en tur.
//
// payload-formerna är PROVISORISKA, samma sorts platshållare som StandingOrderChange
// (se ANDRINGSLOGG.md 2026-09-13) — ingen PlayerAction-payload har en frusen form
// någonstans i specen. INTEL-typen (types.ts) har `stationId`/`targetId`, INGET
// `payload` — så RECRUIT (avsnitt 8.4: "Ny Station i payload.nation") återanvänder
// `targetId` som nationen att rekrytera i. Avsnitt 9.2 säger uttryckligen att CRISIS
// är den ENDA tillåtna ändringen av PlayerAction-unionen i etappen, så INTEL kan
// inte få ett eget payload-fält — se ANDRINGSLOGG.md.
//
// P78 (ETAPP7_TEKNISK_SPEC.md §7.4): varje avvisning nedan går nu via en anrop
// till validateAction() (../../validateAction.js) i stället för en egen inline-
// kontroll — SAMMA villkor, SAMMA reason-strängar, bara flyttade dit så att en
// framtida UI-anropare (P79) kan pröva ett kort mot EXAKT samma regler innan
// turen skickas in. Efter ett godkänt validateAction()-svar slår grenarna nedan
// upp sina mål EN GÅNG TILL (t.ex. `.find(...)!`) — validateAction returnerar
// bara ok/inte-ok, aldrig de uppslagna objekten, så TypeScript kan inte smalna
// av typen över ett funktionsanrop. Ett känt, litet pris för en delad sanningskälla.
//
// UNDANTAGET: "no executive actions remaining" (handlingstaket, nedan) är
// KVAR här, utanför validateAction — den kontrollen handlar om KÖNS kapacitet
// (hur många actions föregår den här i INSKICKNINGEN), inte om handlingens
// EGEN giltighet, och kan strukturellt inte uttryckas av validateAction(state,
// draft, action) (som bara ser EN handling i taget, aldrig hela listan/dess
// ordning). Se validateAction.ts:s egen kommentar för den fulla motiveringen
// och docs/ANDRINGSLOGG.md för beslutet.
import balanceData from '../../data/balance.json' with { type: 'json' }
import { advanceDesignTesting, advanceRndQueue, advanceStations } from '../upkeep.js'
import { resolvePendingCrisis } from '../crisis.js'
import { applyPolitical } from '../political.js'
import { round } from '../../money.js'
import { BROKER_CONTRACT_ID_PREFIX, recordExpense, recordFinancing, recordIncome } from '../../ledger.js'
import { deriveSupplyCostIndex } from './supply.js'
import { computeUnitCostNow, getProduct } from '../../pricing.js'
import { findOfficial } from '../../officials.js'
import { validateAction } from '../../validateAction.js'
import { applyStandingOrders } from '../../standingOrders.js'
import { applyCrashProgramme, startTrackedResearch } from '../../research.js'
import { applyReverseEngineer } from '../../capture.js'
import { applyProcurement, applyProgrammeIntel, parseProgrammeTarget } from '../../programme.js'
import { recordTrace } from '../../traces.js'
import { grownCoverage } from '../../stationCoverage.js'
import { inflateAssessment, parseAssessmentTarget } from '../../race.js'
import { resolveOverdueInvestigations } from '../../investigations.js'
import type { HirableRole } from '../../validateAction.js'
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Commodity, Contract, GameState, OfficialId, ProductionLine, Station, TechCategory } from '../../types.js'
import { allLines, assemblyWorks, freeLineSlots } from '../../works.js'

interface Balance {
  buildLineCost: number
  hireCost: number
  hireGain: number
  rndProjectTurns: number
  intelExpandCost: number
  intelRecruitCost: number
  intelReopenCost: number
  intelExposureMin: number
  intelExposureMax: number
  commodityIndexWeight: Record<Commodity, number>
  marketReleaseCommodityImpactPerMoney: number
  supplyIndexMin: number
  supplyIndexMax: number
  // P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 3.5): BROKER.
  brokerStandingCost: number
  brokerScandalRiskGain: number
  brokerDeliveryTurns: number
  // P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): counterIntelligence/LEAK/SABOTAGE/TURN.
  counterIntelligenceDefault: number
  intelOpBaseSuccessPct: number
  intelOpMinSuccessPct: number
  intelCovertOpCost: number
  leakRelationPenalty: number
  turnRelationGain: number
  turnFailureStandingPenalty: number
  intelCaughtCounterIntelligenceGain: number
  rivalSabotageCooldownTurns: number
}
const BALANCE = balanceData as unknown as Balance

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// P60 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.3): "landets egen tjänst ... skalar
// hur mycket exposure spelarens operationer i landet genererar" — gäller ALLA
// INTEL-operationer med en exposure-effekt (EXPAND sedan P18, LEAK/SABOTAGE/
// TURN nya), inte bara de tre nya. counterIntelligenceDefault är BÅDA
// startvärdet OCH nämnaren, så ett obehandlat land ger multiplier 1,0 —
// ingen förändring mot den ordinarie EXPAND-exponeringen innan P60.
function nationDisplayName(draft: GameState, nation: string): string {
  return draft.factions[nation]?.name.toUpperCase() ?? nation.toUpperCase()
}

function counterIntelligenceExposureMultiplier(draft: GameState, nation: string): number {
  const faction = draft.factions[nation]
  const ci = faction ? faction.counterIntelligence : BALANCE.counterIntelligenceDefault
  return ci / BALANCE.counterIntelligenceDefault
}

// P60: LEAK/SABOTAGE/TURN:s gemensamma lyckandechans — "billiga mot ett land
// med svag tjänst och livsfarliga mot ett med stark" (avsnitt 4.3, ordagrant)
// läst som en direkt procentenhet-för-procentenhet avräkning mot en hög
// basnivå, klampad så en extremt stark tjänst aldrig gör operationen strikt
// omöjlig. Se balance.json:s _p60_note. Exporterad sedan P78 — previewAction.ts
// (§7.4) återanvänder EXAKT samma formel för sin sannolikhetsförhandsvisning,
// i stället för en egen handkopierad kopia (samma "en formel, en källa"-
// motivering som bidEstimate/bidding.ts redan följer, se ANDRINGSLOGG.md
// 2026-09-13).
export function intelOpSuccessPct(draft: GameState, nation: string): number {
  const faction = draft.factions[nation]
  const ci = faction ? faction.counterIntelligence : BALANCE.counterIntelligenceDefault
  return clamp(BALANCE.intelOpBaseSuccessPct - ci, BALANCE.intelOpMinSuccessPct, 100)
}

// P60: en misslyckad LEAK/SABOTAGE/TURN "åker fast" — landets tjänst stiger,
// och stationen som utförde operationen blir mer exponerad (samma roll som
// EXPAND:s befintliga exposure-roll, skalad av SAMMA multiplier).
function markIntelOpCaught(draft: GameState, station: Station, emit: ResolveContext['emit']): void {
  const faction = draft.factions[station.nation]
  if (faction) {
    const before = faction.counterIntelligence
    faction.counterIntelligence = Math.min(100, before + BALANCE.intelCaughtCounterIntelligenceGain)
    emit({
      severity: 'ticker',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()}'S COUNTER-INTELLIGENCE SERVICE SHARPENS — ${before.toFixed(0)} → ${faction.counterIntelligence.toFixed(0)}`,
      causeId: null,
      delta: { counterIntelligence: faction.counterIntelligence - before },
      actorIsPlayer: false,
      subjectId: station.nation,
    })
  }

  const before = station.exposure
  const multiplier = counterIntelligenceExposureMultiplier(draft, station.nation)
  station.exposure = Math.min(100, before + BALANCE.intelExposureMin * multiplier)
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STATION ${station.city.toUpperCase()} EXPOSURE RISES — CAUGHT — ${before.toFixed(0)} → ${station.exposure.toFixed(0)}`,
    causeId: null,
    delta: { exposure: station.exposure - before },
    actorIsPlayer: false,
    subjectId: station.nation,
  })
}

export const applyActions: ResolveStep = (ctx) => {
  const { state, draft, submission, rng, emit, rejected } = ctx
  const house = draft.house

  advanceRndQueue(house, emit, { rng, turn: draft.meta.turn, year: draft.meta.year })
  advanceDesignTesting(house, draft.meta.turn, emit) // P110
  advanceStations(ctx)
  // P100: stående order (kostar ingen handling, gäller från nästa tur) — före handlingsloopen.
  applyStandingOrders(ctx)
  resolveOverdueInvestigations(ctx) // P113: utan svar inom fristen räknas en utredning som ett förnekande
  // P108: forskningsspår i kraft startar ett projekt i kategorier som saknar ett (efter advanceRndQueue ovan).
  startTrackedResearch(ctx)
  resolvePendingCrisis(ctx)

  // BRIBE:s tak (bribeRelationMaxPerTurn) är PER TJÄNSTEMAN per tur, inte totalt
  // (P56, ETAPP5_TEKNISK_SPEC.md avsnitt 3.3 — ändrat från per faktion) — flera
  // BRIBE mot samma person samma tur ska inte kringgå taket genom att delas upp,
  // men två BRIBE mot OLIKA personer ska inte dela ett gemensamt tak. Detta är
  // INTE en avvisningsorsak (gain klipps bara tystare, se political.ts) — hör
  // därför inte hemma i validateAction, se den filens huvudkommentar.
  const bribeGainThisTurn = new Map<OfficialId, number>()

  let actionsUsed = 0
  for (const action of submission.actions) {
    if (action.type === 'CRISIS') continue // redan hanterad ovan (resolvePendingCrisis) — kostar ingen actionPoint

    actionsUsed++
    if (actionsUsed > house.actionPoints) {
      rejected.push({ action, reason: 'no executive actions remaining' })
      continue
    }

    const validation = validateAction(state, draft, action)
    if (!validation.ok) {
      rejected.push({ action, reason: validation.reason })
      continue
    }

    if (action.type === 'INTERNAL') {
      switch (action.op) {
        case 'TAKE_LOAN': {
          const payload = action.payload as { amount: number }
          const amount = round(payload.amount)
          house.debt += amount
          house.treasury += amount
          recordFinancing(draft, 'loans', amount)
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `${house.name.toUpperCase()} TAKES OUT A LOAN OF £${amount.toLocaleString('en-GB')}`,
            causeId: null,
            delta: { treasury: amount, debt: amount },
            actorIsPlayer: true,
            subjectId: null,
          })
          break
        }

        case 'REPAY': {
          const payload = action.payload as { amount: number }
          const amount = round(payload.amount)
          house.treasury -= amount
          house.debt -= amount
          recordFinancing(draft, 'repayments', amount)
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `${house.name.toUpperCase()} REPAYS £${amount.toLocaleString('en-GB')} OF DEBT`,
            causeId: null,
            delta: { treasury: -amount, debt: -amount },
            actorIsPlayer: true,
            subjectId: null,
          })
          break
        }

        case 'BUILD_LINE': {
          const cost = BALANCE.buildLineCost
          house.treasury -= cost
          recordExpense(draft, 'lines', cost)
          // P169: den nya linjen går in i första monteringsverket med plats (validateAction har sett till att ett finns).
          const works = assemblyWorks(house).find((w) => freeLineSlots(w) > 0)!
          const line: ProductionLine = {
            id: `line-${allLines(house).length + 1}`,
            productId: null,
            grade: 'A',
            unitsPerTurnAtFull: house.unitsPerLineTurnDefault,
            capacityPct: 100,
            assignedContractId: null,
            status: 'idle',
            blockedReason: null,
            retoolingUntilTurn: null,
          }
          works.lines.push(line)
          emit({
            severity: 'headline',
            scope: 'house',
            headline: `${house.name.toUpperCase()} BUILDS A NEW PRODUCTION LINE (−£${cost.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -cost },
            actorIsPlayer: true,
            subjectId: null,
          })
          break
        }

        case 'HIRE': {
          const payload = action.payload as { role: HirableRole }
          const cost = BALANCE.hireCost
          house.treasury -= cost
          recordExpense(draft, 'hiring', cost)
          const role = payload.role
          const before = house.staff[role]
          house.staff[role] = Math.min(100, before + BALANCE.hireGain)
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `${house.name.toUpperCase()} HIRES A NEW ${role === 'chiefOfStaff' ? 'CHIEF OF STAFF' : role === 'chiefEngineer' ? 'CHIEF ENGINEER' : 'CHIEF SALESMAN'} (−£${cost.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -cost, [role]: house.staff[role] - before },
            actorIsPlayer: true,
            subjectId: null,
          })
          break
        }

        case 'REVERSE_ENGINEER': {
          // P116 (ETAPP9 §6.5, beslut 9G): studera ett erövrat system — forskningsförsprång mot just det systemet.
          applyReverseEngineer(ctx, (action.payload as { systemId: string }).systemId)
          break
        }

        case 'REPRIORITISE_RND': {
          // P108 (ETAPP9 §4.5): ett krasprogram — halverad tid mot dubbel kostnad, bud i kategorin låsta nästa kvartal.
          // Den löpande forskningen sköts av forskningsspår (stående order, research.ts).
          applyCrashProgramme(ctx, (action.payload as { category: TechCategory }).category)
          break
        }
      }
      continue
    }

    // P56 (ETAPP5_TEKNISK_SPEC.md avsnitt 5): filen sprängdes av BRIBE:s
    // omriktning + FUND_CAMPAIGN/FAVOUR — POLITICAL-logiken bröts ut till
    // political.ts (samma mönster som P23 bröt ut crisis.ts/upkeep.ts).
    if (action.type === 'POLITICAL') {
      applyPolitical(ctx, action, bribeGainThisTurn)
      continue
    }

    if (action.type === 'PROCUREMENT') {
      applyProcurement(ctx, action)
      continue
    }

    if (action.type === 'INTEL') {
      switch (action.op) {
        case 'EXPAND': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          house.treasury -= BALANCE.intelExpandCost
          recordExpense(draft, 'intel', BALANCE.intelExpandCost)
          const depthBefore = station.depth
          station.depth = Math.min(5, station.depth + 1) as Station['depth']
          // P60 (avsnitt 4.3): exposure-rullningen skalas nu av landets
          // counterIntelligence, se counterIntelligenceExposureMultiplier.
          const expandExposureMultiplier = counterIntelligenceExposureMultiplier(draft, station.nation)
          station.exposure = Math.min(
            100,
            station.exposure + rng.int(BALANCE.intelExposureMin, BALANCE.intelExposureMax) * expandExposureMultiplier,
          )
          // P167: djupet ger täckning — militär, industri och kabinett från de djup balance.json anger (stationCoverage.ts).
          const grown = grownCoverage(station)
          station.coverage = grown.coverage
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STATION ${station.city.toUpperCase()} EXPANDED — DEPTH ${depthBefore} → ${station.depth}${
              grown.gained.length ? ` — NOW COVERS ${grown.gained.map((c) => c.toUpperCase()).join(', ')}` : ''
            }`,
            causeId: null,
            delta: { treasury: -BALANCE.intelExpandCost, depth: station.depth - depthBefore, ...(grown.gained.length ? { coverage: grown.gained.length } : {}) },
            actorIsPlayer: true,
            subjectId: station.nation,
          })
          break
        }

        case 'RECRUIT': {
          // targetId återanvänds som nationen — se filens huvudkommentar.
          const nation = action.targetId!
          house.treasury -= BALANCE.intelRecruitCost
          recordExpense(draft, 'intel', BALANCE.intelRecruitCost)
          const faction = draft.factions[nation]!
          const station: Station = {
            id: `station-${house.stations.length + 1}`,
            city: `${faction.name.toUpperCase()} STATION`, // ingen städata per nation i etapp 1,5 — se ANDRINGSLOGG.md
            nation,
            depth: 0,
            exposure: 0,
            coverage: ['procurement'],
            status: 'active',
          }
          house.stations.push(station)
          emit({
            severity: 'headline',
            scope: 'house',
            headline: `${house.name.toUpperCase()} RECRUITS A NEW STATION IN ${faction.name.toUpperCase()} (−£${BALANCE.intelRecruitCost.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -BALANCE.intelRecruitCost },
            actorIsPlayer: true,
            subjectId: nation,
          })
          break
        }

        // P167: en vilande station öppnas igen mot en kostnad, med djup, täckning och (nedkyld) exponering kvar. Förut fanns ingen väg tillbaka.
        case 'REOPEN': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          house.treasury -= BALANCE.intelReopenCost
          recordExpense(draft, 'intel', BALANCE.intelReopenCost)
          station.status = 'active'
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STATION ${station.city.toUpperCase()} REOPENED — DEPTH ${station.depth} (−£${BALANCE.intelReopenCost.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -BALANCE.intelReopenCost },
            actorIsPlayer: true,
            subjectId: station.nation,
          })
          break
        }

        case 'WITHDRAW': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          station.status = 'dormant'
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STATION ${station.city.toUpperCase()} WITHDRAWN TO DORMANCY`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: station.nation,
          })
          break
        }

        // P60 (avsnitt 4.3): "billiga mot ett land med svag tjänst och
        // livsfarliga mot ett med stark" — gemensam lyckandechans
        // (intelOpSuccessPct), gemensam kostnad (intelCovertOpCost) och
        // gemensam bestraffning vid misslyckande (markIntelOpCaught). Bara
        // SUCCESS-effekten skiljer de tre åt.
        case 'LEAK': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          // P120 (ETAPP9 §7.3): en LEAK mot en bedömning blåser upp den hos motsidans köpare (ett upplevt gap), lyckandechansen och
          // bestraffningen vid misslyckande är desamma som för övriga LEAK.
          const assessment = parseAssessmentTarget(action.targetId)
          if (assessment) {
            house.treasury -= BALANCE.intelCovertOpCost
            recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
            if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
              const perceiver = assessment.bloc === 'west' ? 'east' : 'west'
              const publicId = inflateAssessment(ctx, perceiver, assessment.category, 'leak', null)
              emit({
                severity: 'ticker',
                scope: 'house',
                headline: `${house.name.toUpperCase()}'S LEAK INFLATES THE ${assessment.bloc.toUpperCase()}'S ${assessment.category.toUpperCase()} ASSESSMENT IN THE ${perceiver.toUpperCase()}'S MINISTRIES (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
                causeId: publicId,
                delta: { treasury: -BALANCE.intelCovertOpCost },
                actorIsPlayer: true,
                subjectId: station.nation,
              })
            } else {
              emit({
                severity: 'ticker',
                scope: 'house',
                headline: `${house.name.toUpperCase()}'S LEAK IN ${nationDisplayName(draft, station.nation)} IS TRACED BACK (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
                causeId: null,
                delta: { treasury: -BALANCE.intelCovertOpCost },
                actorIsPlayer: true,
                subjectId: station.nation,
              })
              markIntelOpCaught(draft, station, emit)
            }
            break
          }
          if (parseProgrammeTarget(action.targetId)) {
            // P124 (ETAPP9 §8.2): mot en upphandling — samma kostnad, lyckandechans och bestraffning som övriga LEAK/SABOTAGE.
            house.treasury -= BALANCE.intelCovertOpCost
            recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
            if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
              applyProgrammeIntel(ctx, 'LEAK', action.targetId!, station.nation)
            } else {
              emit({
                severity: 'ticker',
                scope: 'house',
                headline: `${house.name.toUpperCase()}'S LEAK IN ${nationDisplayName(draft, station.nation)} IS TRACED BACK (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
                causeId: null,
                delta: { treasury: -BALANCE.intelCovertOpCost },
                actorIsPlayer: true,
                subjectId: station.nation,
              })
              markIntelOpCaught(draft, station, emit)
            }
            break
          }
          const rivalId = action.targetId!
          const rival = draft.rivals[rivalId]!
          house.treasury -= BALANCE.intelCovertOpCost
          recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
          if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
            // "billiga mot ett land med svag tjänst" — leaker en rivals
            // relations[nation] (den rivalens ställning hos DEN köparen), inte
            // rivalens relations[player] (ett fält som inte finns).
            const before = rival.relations[station.nation] ?? 0
            const after = Math.max(0, before - BALANCE.leakRelationPenalty)
            rival.relations[station.nation] = after
            emit({
              severity: 'headline',
              scope: 'market',
              headline: `${house.name.toUpperCase()} LEAKS DAMAGING INFORMATION ABOUT ${rival.name.toUpperCase()} IN ${nationDisplayName(draft, station.nation)} (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost, [`relations.${station.nation}`]: after - before },
              actorIsPlayer: true,
              subjectId: rivalId,
            })
          } else {
            emit({
              severity: 'ticker',
              scope: 'house',
              headline: `${house.name.toUpperCase()}'S LEAK IN ${nationDisplayName(draft, station.nation)} IS TRACED BACK (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost },
              actorIsPlayer: true,
              subjectId: station.nation,
            })
            markIntelOpCaught(draft, station, emit)
          }
          break
        }

        case 'SABOTAGE': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          if (parseProgrammeTarget(action.targetId)) {
            // P124 (ETAPP9 §8.2): mot en upphandling — samma kostnad, lyckandechans och bestraffning som övriga LEAK/SABOTAGE.
            house.treasury -= BALANCE.intelCovertOpCost
            recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
            if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
              applyProgrammeIntel(ctx, 'SABOTAGE', action.targetId!, station.nation)
            } else {
              emit({
                severity: 'ticker',
                scope: 'house',
                headline: `${house.name.toUpperCase()}'S SABOTAGE IN ${nationDisplayName(draft, station.nation)} IS TRACED BACK (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
                causeId: null,
                delta: { treasury: -BALANCE.intelCovertOpCost },
                actorIsPlayer: true,
                subjectId: station.nation,
              })
              markIntelOpCaught(draft, station, emit)
            }
            break
          }
          const rivalId = action.targetId!
          const rival = draft.rivals[rivalId]!
          house.treasury -= BALANCE.intelCovertOpCost
          recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
          if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
            // Samma fält rivals.ts:s egen "misslyckad incident sabbar rivalen
            // SJÄLV" redan skriver (avsnitt 2.5) — bidding.ts hoppar redan
            // över en saboterad rivals bud helt. Den här grenen är fältets
            // FÖRSTA spelarstyrda skrivare.
            rival.sabotagedUntilTurn = draft.meta.turn + BALANCE.rivalSabotageCooldownTurns
            emit({
              severity: 'headline',
              scope: 'market',
              headline: `${house.name.toUpperCase()} SABOTAGES ${rival.name.toUpperCase()}'S OPERATIONS IN ${nationDisplayName(draft, station.nation)} (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost },
              actorIsPlayer: true,
              subjectId: rivalId,
            })
          } else {
            emit({
              severity: 'ticker',
              scope: 'house',
              headline: `${house.name.toUpperCase()}'S SABOTAGE ATTEMPT IN ${nationDisplayName(draft, station.nation)} IS TRACED BACK (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost },
              actorIsPlayer: true,
              subjectId: station.nation,
            })
            markIntelOpCaught(draft, station, emit)
          }
          break
        }

        case 'TURN': {
          const station = house.stations.find((s) => s.id === action.stationId)!
          const official = draft.officials[action.targetId!]!
          house.treasury -= BALANCE.intelCovertOpCost
          recordExpense(draft, 'intel', BALANCE.intelCovertOpCost)
          if (rng.chance(intelOpSuccessPct(draft, station.nation))) {
            const before = official.relationToPlayer
            official.relationToPlayer = Math.min(100, before + BALANCE.turnRelationGain)
            official.lastCourtedTurn = draft.meta.turn // P99c: uppvaktning, relationen förfaller inte på ett tag
            emit({
              severity: 'headline',
              scope: 'faction',
              headline: `${house.name.toUpperCase()} TURNS ${official.name.toUpperCase()} (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost, relationToPlayer: official.relationToPlayer - before },
              actorIsPlayer: true,
              subjectId: official.factionId,
            })
          } else {
            const before = official.standing
            official.standing = Math.max(0, before - BALANCE.turnFailureStandingPenalty)
            emit({
              severity: 'ticker',
              scope: 'faction',
              headline: `${house.name.toUpperCase()}'S ATTEMPT TO TURN ${official.name.toUpperCase()} FAILS (−£${BALANCE.intelCovertOpCost.toLocaleString('en-GB')})`,
              causeId: null,
              delta: { treasury: -BALANCE.intelCovertOpCost, standing: official.standing - before },
              actorIsPlayer: true,
              subjectId: official.factionId,
            })
            markIntelOpCaught(draft, station, emit)
          }
          break
        }
      }
      continue
    }

    // P51 (ETAPP4_TEKNISK_SPEC.md avsnitt 4.5): MARKET byggd — hård regel 6
    // gäller nu här också, ingen tyst-svälj-gren kvar. BROKER förblir helt
    // obyggd (avsnitt 9), fortfarande en no-op som bara konsumerar en
    // actionPoint (se testet för det).
    if (action.type === 'MARKET') {
      const spend = round(action.spend)
      const commodity = action.commodity

      if (action.op === 'BUY_FORWARD') {
        // Avsnitt 4.5: "köp ett innehav till dagens pris" — bygget läser
        // innehavet som en pengadenominerad, förköpt subvention (spend kronor
        // idag = spend kronor rabatt mot FRAMTIDA materialkostnad, se
        // production.ts), inte en låst kvantitet/pris. 1:1-kursen ÄR
        // mekaniken, se balance.json:s _p51_note — inget eget balanstal behövs
        // för BUY_FORWARD.
        house.treasury -= spend
        recordExpense(draft, 'commodityPurchase', spend)
        house.commodityHoldings[commodity] += spend
        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} BUYS ${commodity.toUpperCase()} FORWARD (−£${spend.toLocaleString('en-GB')})`,
          causeId: null,
          delta: { treasury: -spend, [`commodityHoldings.${commodity}`]: spend },
          actorIsPlayer: true,
          subjectId: null,
        })
      } else {
        // RELEASE: säljer tillbaka innehavet till samma 1:1-kurs (ger kassa) OCH
        // trycker ner marknadspriset (avsnitt 4.4:s fjärde drivare, "egna
        // inköp") — asymmetriskt mot BUY_FORWARD med avsikt, spec 4.5 ordagrant:
        // bara RELEASE nämns "trycka ner priset ... hjälper dina konkurrenter".
        house.commodityHoldings[commodity] -= spend
        house.treasury += spend
        recordIncome(draft, 'commodityRelease', spend)

        const commodityBefore = draft.market.commodities[commodity]
        const commodityAfter = clamp(
          commodityBefore - spend * BALANCE.marketReleaseCommodityImpactPerMoney,
          BALANCE.supplyIndexMin,
          BALANCE.supplyIndexMax,
        )
        draft.market.commodities[commodity] = commodityAfter
        const indexBefore = draft.market.supplyCostIndex
        draft.market.supplyCostIndex = deriveSupplyCostIndex(draft.market.commodities, BALANCE.commodityIndexWeight)

        emit({
          severity: 'ticker',
          scope: 'house',
          headline: `${house.name.toUpperCase()} RELEASES ${commodity.toUpperCase()} ONTO THE MARKET (+£${spend.toLocaleString('en-GB')}) — ${commodity.toUpperCase()} ${commodityBefore.toFixed(0)} → ${commodityAfter.toFixed(0)}`,
          causeId: null,
          delta: {
            treasury: spend,
            [`commodityHoldings.${commodity}`]: -spend,
            [`commodities.${commodity}`]: commodityAfter - commodityBefore,
            supplyCostIndex: draft.market.supplyCostIndex - indexBefore,
          },
          actorIsPlayer: true,
          subjectId: null,
        })
      }
      continue
    }

    if (action.type === 'BROKER') {
      // P57 (avsnitt 3.5): "förbi computeScore helt" — direktkontrakt till ett
      // pris SPELAREN sätter, avgjort av köparens procurement-tjänsteman
      // (relationToPlayer + integrity), inte av anbudsformeln. grade hårdkodas
      // till 'A' — BROKER-handlingen (types.ts) har inget grade-fält, samma
      // provisoriska val som crisis.ts:s krisköp.
      const faction = draft.factions[action.buyerId]!
      const official = findOfficial(draft, action.buyerId, 'procurement')!

      const product = getProduct(action.productId)
      const contract: Contract = {
        id: `${BROKER_CONTRACT_ID_PREFIX}${action.buyerId}-${draft.meta.turn}-${actionsUsed}`,
        buyerId: action.buyerId,
        productId: action.productId,
        quantity: action.quantity,
        unitsDelivered: 0,
        price: action.price,
        unitCostAtSigning: computeUnitCostNow(product, 'A', draft.market.commodities),
        grade: 'A',
        dueTurn: draft.meta.turn + BALANCE.brokerDeliveryTurns,
        status: 'active',
        lateEventId: null,
        advancePct: 0, // P98: inget förskott utan en Order
        advancePaid: 0,
        // Går inte via en Order — samma fallback som crisis.ts:s krisköp.
        frontId: null,
      }
      draft.market.contracts.push(contract)

      // "en standing-kostnad för henne och en scandalRisk för båda" — henne:
      // Official.standing/scandalRisk. Spelarsidan: Station.exposure i landet
      // (House saknar ett House-nivå-scandalRisk-fält, se balance.json:s
      // _p57_note), samma "ingen station, ingen effekt"-princip som
      // misattributionExposurePenalty (political.ts).
      official.standing = Math.max(0, official.standing - BALANCE.brokerStandingCost)
      official.scandalRisk = Math.min(100, official.scandalRisk + BALANCE.brokerScandalRiskGain)
      const station = house.stations.find((s) => s.nation === action.buyerId && s.status === 'active')
      if (station) {
        station.exposure = Math.min(100, station.exposure + BALANCE.brokerScandalRiskGain)
      }

      const brokerId = emit({
        severity: 'headline',
        scope: 'market',
        headline: `${house.name.toUpperCase()} BROKERS A DIRECT DEAL WITH ${faction.name.toUpperCase()} — ${product.name.toUpperCase()} × ${action.quantity}`,
        causeId: null,
        delta: { price: action.price, standing: -BALANCE.brokerStandingCost, scandalRisk: BALANCE.brokerScandalRiskGain },
        actorIsPlayer: true,
        subjectId: action.buyerId,
      })
      // P125 (beslut 9N): en direktaffär förbi anbudet ger ett spår (allvar 2) kopplat till kontraktet.
      recordTrace(ctx, { houseId: 'player', officialId: official.id, buyerId: action.buyerId, kind: 'broker', severity: 2, contractId: contract.id }, brokerId)
      continue
    }
  }
}
