// applyActions — spelarens handlingar och bud, i inskickad ordning (spec 3.1).
// Se ETAPP1_TEKNISK_SPEC.md avsnitt 3.2, 10 och ETAPP1_5_TEKNISK_SPEC.md avsnitt 8.
//
// P17 byggde house.actionPoints (8.1) och INTERNAL i sin helhet (8.2). P18 byggde
// två av tre POLITICAL-op (BRIBE, STAGE_INCIDENT, BACK_CHANNEL — FUND_COUP förblir
// etapp 2) och en minimal INTEL (EXPAND, RECRUIT, WITHDRAW — LEAK/SABOTAGE/TURN är
// medvetna no-ops, avvisade med 'not implemented in this stage', avsnitt 8.4).
// BROKER och MARKET förblir helt obyggda — ingen prompt i avsnitt 10 äger dem i
// etapp 1,5 — men konsumerar fortfarande en actionPoint, se nedan.
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
import balanceData from '../../data/balance.json' with { type: 'json' }
import { addDoomsday } from '../doomsdayGate.js'
import { advanceRndQueue, advanceStations } from '../upkeep.js'
import { resolvePendingCrisis } from '../crisis.js'
import { round } from '../../money.js'
import type { ResolveStep } from '../index.js'
import type {
  FactionId,
  GameState,
  Money,
  ProductionLine,
  RndProject,
  Station,
  TechCategory,
} from '../../types.js'

interface Balance {
  buildLineCost: number
  maxProductionLines: number
  hireCost: number
  hireGain: number
  rndProjectTurns: number
  bribeRelationCostPerPoint: number
  bribeRelationMaxPerTurn: number
  stageIncidentSuccessPct: number
  stageIncidentHeatMin: number
  stageIncidentHeatMax: number
  stageIncidentDoomsdayMin: number
  stageIncidentDoomsdayMax: number
  backChannelDoomsdayMin: number
  backChannelDoomsdayMax: number
  intelExpandCost: number
  intelRecruitCost: number
  intelExposureMin: number
  intelExposureMax: number
  maxStations: number
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']
const HIRABLE_ROLES = ['chiefEngineer', 'chiefSalesman', 'chiefOfStaff'] as const
type HirableRole = (typeof HIRABLE_ROLES)[number]

function isTakeLoanPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

function isRepayPayload(payload: Record<string, unknown>): payload is { amount: number } {
  return typeof payload.amount === 'number' && Number.isFinite(payload.amount) && payload.amount > 0
}

function isHirePayload(payload: Record<string, unknown>): payload is { role: HirableRole } {
  return typeof payload.role === 'string' && (HIRABLE_ROLES as readonly string[]).includes(payload.role)
}

function isRndPayload(payload: Record<string, unknown>): payload is { category: TechCategory } {
  return typeof payload.category === 'string' && (TECH_CATEGORIES as readonly string[]).includes(payload.category)
}

// buyerId (en Faction) hör till en teater genom den front den står på — samma
// logik som pricing.ts:s computeHeatForBuyer, men den funktionen returnerar bara
// heat-talet, inte teatern själv (som STAGE_INCIDENT behöver för att kunna HÖJA
// den). Ingen delad helper fanns för "hitta teatern", så en liten egen håller sig
// här i stället för att bredda pricing.ts:s publika yta för en enda konsument.
function findTheatreForFaction(draft: GameState, factionId: FactionId): GameState['theatres'][string] | null {
  const front = Object.values(draft.fronts).find((f) => f.sideA === factionId || f.sideB === factionId)
  if (!front) return null
  return draft.theatres[front.theatreId] ?? null
}

export const applyActions: ResolveStep = (ctx) => {
  const { draft, submission, rng, emit, rejected } = ctx
  const house = draft.house

  advanceRndQueue(house, emit)
  advanceStations(ctx)
  resolvePendingCrisis(ctx)

  // house.creditLimit uppdateras inte förrän economy.ts (senare i samma pipeline-
  // passage) — så flera TAKE_LOAN i samma inskickning måste bokföras mot en lokal,
  // krympande kopia, annars kunde spelaren stapla lån långt över den faktiska
  // gränsen genom att bara skicka in många handlingar samma tur.
  let remainingCredit = house.creditLimit
  let rndSeq = 0
  // BRIBE:s tak (bribeRelationMaxPerTurn) är PER MÅLFAKTION per tur, inte totalt —
  // flera BRIBE mot samma faktion samma tur ska inte kringgå taket genom att delas
  // upp, men två BRIBE mot OLIKA faktioner ska inte dela ett gemensamt tak.
  const bribeGainThisTurn = new Map<FactionId, number>()

  let actionsUsed = 0
  for (const action of submission.actions) {
    if (action.type === 'CRISIS') continue // redan hanterad ovan (resolvePendingCrisis) — kostar ingen actionPoint

    actionsUsed++
    if (actionsUsed > house.actionPoints) {
      rejected.push({ action, reason: 'no executive actions remaining' })
      continue
    }

    if (action.type === 'INTERNAL') {
      switch (action.op) {
        case 'TAKE_LOAN': {
          if (!isTakeLoanPayload(action.payload)) {
            rejected.push({ action, reason: 'invalid loan amount' })
            continue
          }
          const amount = round(action.payload.amount)
          if (amount > remainingCredit) {
            rejected.push({ action, reason: 'credit limit exceeded' })
            continue
          }
          house.debt += amount
          house.treasury += amount
          remainingCredit -= amount
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
          if (!isRepayPayload(action.payload)) {
            rejected.push({ action, reason: 'invalid repayment amount' })
            continue
          }
          const amount: Money = round(action.payload.amount)
          if (amount > Math.min(house.treasury, house.debt)) {
            rejected.push({ action, reason: 'repayment exceeds treasury or debt' })
            continue
          }
          house.treasury -= amount
          house.debt -= amount
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
          if (house.lines.length >= BALANCE.maxProductionLines) {
            rejected.push({ action, reason: 'maximum production lines reached' })
            continue
          }
          const cost = BALANCE.buildLineCost
          house.treasury -= cost
          const line: ProductionLine = {
            id: `line-${house.lines.length + 1}`,
            productId: null,
            grade: 'A',
            unitsPerTurnAtFull: house.unitsPerLineTurnDefault,
            capacityPct: 100,
            assignedContractId: null,
            status: 'idle',
            blockedReason: null,
          }
          house.lines.push(line)
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
          if (!isHirePayload(action.payload)) {
            rejected.push({ action, reason: 'invalid hire role' })
            continue
          }
          const cost = BALANCE.hireCost
          house.treasury -= cost
          const role = action.payload.role
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

        case 'REPRIORITISE_RND': {
          if (!isRndPayload(action.payload)) {
            rejected.push({ action, reason: 'invalid R&D category' })
            continue
          }
          const category = action.payload.category
          const project: RndProject = {
            id: `rnd-${category}-${draft.meta.turn}-${rndSeq++}`,
            category,
            turnsRemaining: BALANCE.rndProjectTurns,
            turnsTotal: BALANCE.rndProjectTurns,
          }
          house.rnd.push(project)
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `${house.name.toUpperCase()} REPRIORITISES R&D TOWARD ${category.toUpperCase()}`,
            causeId: null,
            delta: {},
            actorIsPlayer: true,
            subjectId: null,
          })
          break
        }
      }
      continue
    }

    if (action.type === 'POLITICAL') {
      const target = draft.factions[action.targetFactionId]
      if (!target) {
        rejected.push({ action, reason: 'unknown target faction' })
        continue
      }
      if (!Number.isFinite(action.spend) || action.spend < 0) {
        rejected.push({ action, reason: 'invalid spend amount' })
        continue
      }

      switch (action.op) {
        case 'BRIBE': {
          house.treasury -= action.spend
          const alreadyGained = bribeGainThisTurn.get(target.id) ?? 0
          const roomLeftThisTurn = Math.max(0, BALANCE.bribeRelationMaxPerTurn - alreadyGained)
          const rawGain = action.spend / BALANCE.bribeRelationCostPerPoint
          const gain = Math.min(rawGain, roomLeftThisTurn, 100 - target.relationToPlayer)
          target.relationToPlayer += gain
          bribeGainThisTurn.set(target.id, alreadyGained + gain)
          emit({
            severity: 'ticker',
            scope: 'faction',
            headline: `${house.name.toUpperCase()} CULTIVATES ${target.name.toUpperCase()} (−£${action.spend.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -action.spend, relationToPlayer: gain },
            actorIsPlayer: true,
            subjectId: target.id,
          })
          break
        }

        case 'STAGE_INCIDENT': {
          house.treasury -= action.spend
          const succeeded = rng.chance(BALANCE.stageIncidentSuccessPct)

          if (succeeded) {
            const theatre = findTheatreForFaction(draft, target.id)
            let headline = `INCIDENT STAGED AGAINST ${target.name.toUpperCase()}`
            if (theatre) {
              const before = theatre.heat
              theatre.heat = Math.min(100, theatre.heat + rng.int(BALANCE.stageIncidentHeatMin, BALANCE.stageIncidentHeatMax))
              headline = `INCIDENT STAGED AGAINST ${target.name.toUpperCase()} — ${theatre.name.toUpperCase()} HEAT ${before.toFixed(0)} → ${theatre.heat.toFixed(0)}`
            }
            const incidentId = emit({
              severity: 'headline',
              scope: 'faction',
              headline,
              causeId: null,
              delta: { treasury: -action.spend },
              actorIsPlayer: true,
              subjectId: target.id,
            })

            if (Math.abs(target.alignment) > 60) {
              const amount = rng.int(BALANCE.stageIncidentDoomsdayMin, BALANCE.stageIncidentDoomsdayMax)
              addDoomsday(ctx, amount, incidentId)
            }
          } else {
            house.exposureEvents.push(draft.meta.turn)
            emit({
              severity: 'headline',
              scope: 'house',
              headline: `${house.name.toUpperCase()} LINKED TO INCIDENT AGAINST ${target.name.toUpperCase()} — ATTRIBUTION FAILED`,
              causeId: null,
              delta: { treasury: -action.spend },
              actorIsPlayer: true,
              subjectId: target.id,
            })
          }
          break
        }

        case 'BACK_CHANNEL': {
          house.treasury -= action.spend
          const channelId = emit({
            severity: 'ticker',
            scope: 'faction',
            headline: `${house.name.toUpperCase()} OPENS A BACK CHANNEL WITH ${target.name.toUpperCase()} (−£${action.spend.toLocaleString('en-GB')})`,
            causeId: null,
            delta: { treasury: -action.spend },
            actorIsPlayer: true,
            subjectId: target.id,
          })
          const amount = rng.int(BALANCE.backChannelDoomsdayMin, BALANCE.backChannelDoomsdayMax)
          addDoomsday(ctx, -amount, channelId)
          break
        }

        default:
          // BRIBE är byggd, STAGE_INCIDENT/BACK_CHANNEL är byggda — FUND_COUP finns
          // inte i PoliticalOp (förblir etapp 2, DESIGN.md §13). Inget att göra här.
          break
      }
      continue
    }

    if (action.type === 'INTEL') {
      switch (action.op) {
        case 'EXPAND': {
          const station = house.stations.find((s) => s.id === action.stationId)
          if (!station) {
            rejected.push({ action, reason: 'unknown station' })
            continue
          }
          house.treasury -= BALANCE.intelExpandCost
          const depthBefore = station.depth
          station.depth = Math.min(5, station.depth + 1) as Station['depth']
          station.exposure = Math.min(100, station.exposure + rng.int(BALANCE.intelExposureMin, BALANCE.intelExposureMax))
          emit({
            severity: 'ticker',
            scope: 'house',
            headline: `STATION ${station.city.toUpperCase()} EXPANDED — DEPTH ${depthBefore} → ${station.depth}`,
            causeId: null,
            delta: { treasury: -BALANCE.intelExpandCost, depth: station.depth - depthBefore },
            actorIsPlayer: true,
            subjectId: station.nation,
          })
          break
        }

        case 'RECRUIT': {
          // targetId återanvänds som nationen — se filens huvudkommentar.
          const nation = action.targetId
          if (!nation || !draft.factions[nation]) {
            rejected.push({ action, reason: 'invalid recruit target' })
            continue
          }
          if (house.stations.length >= BALANCE.maxStations) {
            rejected.push({ action, reason: 'maximum stations reached' })
            continue
          }
          house.treasury -= BALANCE.intelRecruitCost
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

        case 'WITHDRAW': {
          const station = house.stations.find((s) => s.id === action.stationId)
          if (!station) {
            rejected.push({ action, reason: 'unknown station' })
            continue
          }
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

        case 'LEAK':
        case 'SABOTAGE':
        case 'TURN':
          rejected.push({ action, reason: 'not implemented in this stage' })
          break
      }
      continue
    }

    // BROKER, MARKET: se filens huvudkommentar — obyggda i etapp 1,5, men har redan
    // konsumerat en actionPoint ovan.
  }
}
