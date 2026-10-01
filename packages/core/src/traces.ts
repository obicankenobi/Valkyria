// traces — P124 (ETAPP9_FORSLAG.md §8.3, beslut 9N). Pappersspåret: varje korrupt handling ger ett spår (vem, vilken tjänsteman, vilken
// sorts handling, hur allvarlig, vilken tur). P124 skriver spåren (knepen i upphandlingarna); P125 låter dem komma fram, ger
// utredningskortet och följderna.
//
// Varje nytt spår emitterar en WireEvent (hård regel 4). Husets eget spår säger vad det är; en rivals spår får en neutral rad som
// inte avslöjar vem eller vad (annars vore spåret inte dolt). Ingen slump här.
import type { ResolveContext } from './resolve/index.js'
import type { FactionId, PaperTrace, TraceKind } from './types.js'

export interface NewTrace {
  houseId: 'player' | string
  officialId: string | null
  buyerId: FactionId | null
  kind: TraceKind
  severity: 1 | 2 | 3
  programmeId?: string
  contractId?: string
}

const KIND_TEXT: Record<TraceKind, string> = {
  writeSpec: 'SHAPING THE REQUIREMENTS',
  handbuilt: 'A HAND-BUILT TEST ARTICLE',
  bribeBoard: 'PAYMENTS TO THE TEST BOARD',
  falsify: 'A FORGED TEST PROTOCOL',
  bidBribe: 'A BRIBE IN A BID',
  bribe: 'A PAYMENT TO AN OFFICIAL',
  broker: 'A BROKERED DEAL',
  favour: 'A FAVOUR CALLED IN',
  legal: 'LEGAL ADVICE ON THE FILES',
}

// Skriver ett spår i staten och returnerar det. `causeId` är den handling eller händelse som orsakade det.
export function recordTrace(ctx: ResolveContext, input: NewTrace, causeId: string | null): PaperTrace {
  const { draft, emit } = ctx
  const traces = (draft.traces ??= [])
  const trace: PaperTrace = {
    id: `trace-${traces.length + 1}`,
    houseId: input.houseId,
    officialId: input.officialId,
    buyerId: input.buyerId,
    kind: input.kind,
    severity: input.severity,
    turn: draft.meta.turn,
    ...(input.programmeId !== undefined ? { programmeId: input.programmeId } : {}),
    ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
    status: 'open',
  }
  traces.push(trace)
  if (input.programmeId !== undefined) {
    const programme = draft.programmes?.find((p) => p.id === input.programmeId)
    if (programme) programme.traces.push(trace.id)
  }
  const mine = input.houseId === 'player'
  const buyer = input.buyerId ? (draft.factions[input.buyerId]?.name.toUpperCase() ?? input.buyerId.toUpperCase()) : 'A MINISTRY'
  emit({
    severity: 'ticker',
    scope: mine ? 'house' : 'market',
    headline: mine
      ? `A PAPER TRAIL IS LEFT: ${KIND_TEXT[input.kind]} (${buyer})`
      : `THE ${buyer} MINISTRY ADDS TO ITS FILES`,
    causeId,
    delta: { [`traces.${trace.id}`]: input.severity },
    actorIsPlayer: mine,
    subjectId: input.buyerId,
  })
  return trace
}
