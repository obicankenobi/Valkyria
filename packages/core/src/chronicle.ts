// chronicle — P89 (ETAPP7_TEKNISK_SPEC.md §9/§13). Klassificerar en turs
// nyemitterade WireEvent till ChronicleEntry. Ren funktion, ingen mutation,
// anropad från resolveTurn() själv (resolve/index.ts), inte ett PIPELINE-
// steg — se GameState.chronicle:s egen kommentar (types.ts) för varför.
//
// WireEvent har ingen strukturerad "kind" (bara fri text, se
// packages/app/src/newsClassification.ts:s egen kommentar om samma
// begränsning) — mönstren nedan är hämtade direkt ur de faktiska
// emit()-anropen i resolve/ (political.ts, applyActions.ts, crisis.ts,
// factions.ts, upkeep.ts, bidding.ts), samma metod newsClassification.ts
// redan använder för FLASH_PATTERNS, verifierade mot koden, inte gissade.
// Skillnaden mot den filen: den här bor i packages/core, eftersom
// GameState.chronicle är kärndata (måste vara deterministisk och del av
// den sparade staten) — newsClassification.ts:s ANDA ("rör aldrig
// packages/core") gäller den ANDRA riktningen: presentation får aldrig
// styra kärnan, men kärnan får mycket väl läsa sin egen redan emitterade
// text.
import type { ChronicleEntry, ChronicleKind, WireEvent } from './types.js'

const KIND_PATTERNS: { kind: ChronicleKind; patterns: RegExp[] }[] = [
  { kind: 'coup', patterns: [/FUNDS A SUCCESSFUL COUP IN/] },
  {
    kind: 'incident',
    patterns: [/INCIDENT STAGED AGAINST/, /LINKED TO INCIDENT AGAINST/, /BOTCHED INCIDENT AGAINST/],
  },
  { kind: 'assassination', patterns: [/HAS .+ ASSASSINATED/] },
  { kind: 'leak', patterns: [/LEAKS DAMAGING INFORMATION ABOUT/, /LEAK IN .+ IS TRACED BACK/] },
  { kind: 'sabotage', patterns: [/SABOTAGES .+ OPERATIONS IN/, /SABOTAGE ATTEMPT IN .+ IS TRACED BACK/] },
  { kind: 'crisis', patterns: [/^PUSH —/, /^BACK DOWN/, /^SELL THE FILE —/] },
  { kind: 'exposure', patterns: [/^STATION .+ BURNED/] },
  { kind: 'bankruptcy', patterns: [/BANKRUPT — ALL CONTRACTS VOIDED/] },
  { kind: 'ceasefire', patterns: [/^CEASEFIRE ON THE/] },
  // 'contract': bara husets EGNA vunna kontrakt, aldrig ett rivalhus — se
  // classifyEvent nedan (actorIsPlayer avgör, inte headlinen, eftersom
  // spelarens och rivalernas "WINS CONTRACT"-rubriker delar samma svans).
  { kind: 'contract', patterns: [/WINS CONTRACT:/] },
]

// 'restricted_delivery' kan INTE avgöras av en enskild rubrik — en restricted
// leverans emitterar SAMMA "DELIVERED ..."-rubrik som en vanlig leverans
// (deliveries.ts), bara följd av ett SEPARAT doomsdayGate-event med
// causeId satt till leveransens id (addDoomsday(ctx, ..., deliveryId)).
// Kopplingen görs via causeId, inte text.
function findCausedDoomsdayDelta(events: readonly WireEvent[], causeId: string): number {
  let total = 0
  for (const event of events) {
    if (event.causeId === causeId && event.headline.startsWith('DOOMSDAY ')) {
      total += event.delta.doomsday ?? 0
    }
  }
  return total
}

function causeHeadlinesFor(events: readonly WireEvent[], event: WireEvent): string[] {
  const chain: string[] = []
  let current: WireEvent | undefined = event
  for (let depth = 0; depth < 3 && current?.causeId; depth++) {
    const cause = events.find((e) => e.id === current!.causeId)
    if (!cause) break
    chain.push(cause.headline)
    current = cause
  }
  return chain
}

export function classifyChronicleEntries(events: readonly WireEvent[]): ChronicleEntry[] {
  const entries: ChronicleEntry[] = []

  for (const event of events) {
    if (event.headline.startsWith('DELIVERED ') && findCausedDoomsdayDelta(events, event.id) !== 0) {
      entries.push({
        turn: event.turn,
        kind: 'restricted_delivery',
        headline: event.headline,
        actorIsPlayer: event.actorIsPlayer,
        causeHeadlines: causeHeadlinesFor(events, event),
        doomsdayDelta: findCausedDoomsdayDelta(events, event.id),
      })
      continue
    }

    for (const { kind, patterns } of KIND_PATTERNS) {
      if (!patterns.some((p) => p.test(event.headline))) continue
      if (kind === 'contract' && !event.actorIsPlayer) continue // rivalernas vinster räknas inte hit
      entries.push({
        turn: event.turn,
        kind,
        headline: event.headline,
        actorIsPlayer: event.actorIsPlayer,
        causeHeadlines: causeHeadlinesFor(events, event),
        doomsdayDelta: event.delta.doomsday ?? findCausedDoomsdayDelta(events, event.id),
      })
      break // en händelse matchar högst en kind
    }
  }

  return entries
}

// "tak 80, äldsta icke-spelarhändelser gallras först" — spelarens egna
// händelser skyddas, så partiets EGEN historia (kupper, mutor, lönnmord
// spelaren faktiskt begick) aldrig tystas bort av rutinmässiga
// motståndarhändelser (en faktions bankrutt, en vapenvila) som råkar komma
// senare.
export const CHRONICLE_CAP = 80

export function appendChronicle(existing: readonly ChronicleEntry[], newEntries: readonly ChronicleEntry[]): ChronicleEntry[] {
  let combined = [...existing, ...newEntries]
  while (combined.length > CHRONICLE_CAP) {
    const oldestNonPlayerIndex = combined.findIndex((e) => !e.actorIsPlayer)
    if (oldestNonPlayerIndex >= 0) {
      combined.splice(oldestNonPlayerIndex, 1)
    } else {
      combined = combined.slice(1) // alla kvarvarande är spelarens — gallra äldst
    }
  }
  return combined
}
