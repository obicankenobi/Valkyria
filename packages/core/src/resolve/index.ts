// resolveTurn — motorns enda ingång. Kontraktet står i ETAPP1_TEKNISK_SPEC.md avsnitt 3.
//
// P2 bygger hela stegpipelinen och all wire-/rejected-infrastruktur, men alla tretton
// namngivna steg i PIPELINE är tomma no-ops — riktig spelregellogik kommer i P3–P8
// (se respektive steg-fil för vilken prompt). Stegordningen är spelregler och får
// aldrig ändras av bekvämlighet (CLAUDE.md hård regel 7).
//
// Tur- och datumbokföring hör inte till något enskilt regelsteg — inget av de
// tretton namngivna äger "vilken tur det är" — så det görs direkt här, i
// resolveTurns egen triviala bokföring runt pipelinen, inte som ett fjortonde steg.
// Samma ställe gör också ett enda symboliskt rng.next()-drag: det bevisar att
// createRng-till-cursor-trådningen fungerar innan P3+ ersätter no-ops med regler
// som faktiskt behöver tal. Se P2:s klart-när-villkor "rngCursor ökar" i spec
// avsnitt 10.
import { cloneState } from '../state.js'
import { createRng } from '../rng.js'
import type { Rng } from '../rng.js'
import { createWireEmitter, pruneWire } from '../wire.js'
import type {
  GameState,
  TurnSubmission,
  TurnResult,
  WireEvent,
} from '../types.js'
import { applyActions } from './steps/applyActions.js'
import { production } from './steps/production.js'
import { deliveries } from './steps/deliveries.js'
import { fronts } from './steps/fronts.js'
import { attrition } from './steps/attrition.js'
import { factions } from './steps/factions.js'
import { politics } from './steps/politics.js'
import { heat } from './steps/heat.js'
import { supply } from './steps/supply.js'
import { doomsday } from './steps/doomsday.js'
import { rivals } from './steps/rivals.js'
import { orders } from './steps/orders.js'
import { bidding } from './steps/bidding.js'
import { economy } from './steps/economy.js'
import { board } from './steps/board.js'
import { endings } from './steps/endings.js'

export type ResolveStep = (ctx: ResolveContext) => void

export interface ResolveContext {
  // P78 (ETAPP7_TEKNISK_SPEC.md §7.4): state vid TURENS BÖRJAN, innan någon av
  // den här inskickningens actions är tillämpade — validateAction() behöver
  // den för att räkna TAKE_LOAN:s kreditrest korrekt (se validateAction.ts:s
  // egen kommentar). Aldrig muterad (samma indata som resolveTurns eget
  // `state`-argument, inte en klon av draft) — hård regel 3 gäller ograverad.
  state: Readonly<GameState>
  draft: GameState
  submission: TurnSubmission
  rng: Rng
  emit: (e: Omit<WireEvent, 'id' | 'turn'>) => string // returnerar id, för causeId
  rejected: TurnResult['rejected']
}

// Ordningen är spelregler. Ändra den aldrig av bekvämlighet (CLAUDE.md hård regel 7).
const PIPELINE: ResolveStep[] = [
  applyActions, // spelarens handlingar, i inskickad ordning
  production, // linjer producerar mot kontrakt; styckkostnad bokförs HÄR
  deliveries, // leveranser anländer, betalning, materiel in på front
  fronts, // frontresolve + attribution
  attrition, // materielförslitning — ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 3, insatt direkt efter fronts (P33)
  factions, // ekonomi, publicSupport, bankrutt
  // P57 (ETAPP5_TEKNISK_SPEC.md avsnitt 10 punkt 3, beslutat vid antagandet):
  // nytt steg, ordagrant placerat mellan factions och heat.
  politics, // en tjänsteman med tillräcklig standing vars agenda är ohörsammad fattar ett beslut
  heat, // per teater
  supply, // supplyCostIndex — ETAPP1_5_TEKNISK_SPEC.md avsnitt 3, insatt mellan heat och doomsday
  doomsday, // avkylning, trösklar, krisevent
  rivals, // rivalhusens drag
  orders, // nya utlysningar genereras, referencePrice fryses
  bidding, // avgör anbud som löper ut denna tur
  economy, // husets fasta kostnader, ränta, creditLimit, kassaflöde
  board, // styrelsemål, progressSnapshot, prognoskontroller
  endings, // kontrollerar alla fem slutvillkor
]

export function resolveTurn(state: Readonly<GameState>, submission: TurnSubmission): TurnResult {
  // Krav 2 (spec 3): ingen mutation av indata. Klona in, mutera utkastet, returnera.
  const draft = cloneState(state)

  const rng = createRng(draft.meta.seed, draft.meta.rngCursor)
  const wireEmitter = createWireEmitter(draft.meta.turn, draft.wire)
  const rejected: TurnResult['rejected'] = []

  const ctx: ResolveContext = {
    state,
    draft,
    submission,
    rng,
    emit: wireEmitter.emit,
    rejected,
  }

  for (const step of PIPELINE) {
    step(ctx)
  }

  advanceTurn(draft)

  // Symboliskt drag, se filkommentaren ovan. Tas bort/ersätts när en riktig regel
  // faktiskt behöver ett tal.
  rng.next()

  draft.meta.rngCursor = rng.cursor()
  draft.wire = pruneWire(wireEmitter.allEvents(), draft.meta.turn)

  return {
    state: draft,
    wire: wireEmitter.thisTurnEvents(),
    rejected,
  }
}

function advanceTurn(draft: GameState): void {
  draft.meta.turn += 1
  const absoluteQuarterIndex = draft.meta.year * 4 + (draft.meta.quarter - 1) + 1
  draft.meta.year = Math.floor(absoluteQuarterIndex / 4)
  draft.meta.quarter = ((absoluteQuarterIndex % 4) + 1) as 1 | 2 | 3 | 4
}
