import { describe, expect, it } from 'vitest'
import { resolveTurn } from '../../src/resolve/index.js'
import { createInitialState } from '../../src/state.js'
import { pruneWire } from '../../src/wire.js'
import type { GameState, TurnSubmission, WireEvent } from '../../src/types.js'

const EMPTY_SUBMISSION: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function assertNoDanglingCauseId(wire: readonly WireEvent[]): void {
  const ids = new Set(wire.map((e) => e.id))
  for (const event of wire) {
    if (event.causeId !== null) {
      expect(ids.has(event.causeId)).toBe(true)
    }
  }
}

describe('wire-chains invariant', () => {
  it('20 turer via resolveTurn: inget causeId i state.wire pekar på en saknad händelse', () => {
    let state: GameState = createInitialState('indochina-slice', 'wire-chains-seed')

    for (let i = 0; i < 20; i++) {
      const result = resolveTurn(state, EMPTY_SUBMISSION)
      assertNoDanglingCauseId(result.state.wire)
      state = result.state
    }

    // Från och med P3 emittar economy.ts på riktigt varje tur, så det här är inte
    // längre ett tomt, provocerat test — pruneWire har faktiskt något att beskära
    // (economy.ts:s egna händelser har alla causeId: null, så kedjedjupet prövas
    // fortfarande huvudsakligen av den syntetiska historiken nedan, men mängden
    // riktiga händelser och en riktig 20-turers körning prövas här).
    expect(state.wire.length).toBeGreaterThan(0)
    // Fönstret är 8 turer — en 20-turerskörning ska ha beskurit bort de äldsta.
    // Sedan P27 (avsnitt 3.1) kan en 'voided'-händelses causeId peka tillbaka på
    // den 'late'-händelse som orsakade den, upp till contractGracePeriodTurns
    // turer tidigare — pruneWire:s egen WIRE_CHAIN_DEPTH-logik (wire.ts) håller
    // då den äldre 'late'-händelsen vid liv ÄVEN OM den ligger utanför det råa
    // 8-turersfönstret, exakt det regel 2 i spec 2.6 finns för att garantera
    // (en synlig händelse ska aldrig peka på en osynlig). Den strikta
    // fönstergränsen nedan är alltså inte längre en giltig invariant i sig — det
    // riktiga skyddet är `assertNoDanglingCauseId` ovan, som körs varje tur.
    // Kvar här: bevisa att beskärning FAKTISKT sker över en lång körning, inte en
    // exakt gräns.
    const oldestKeptTurn = Math.min(...state.wire.map((e) => e.turn))
    expect(oldestKeptTurn).toBeGreaterThan(0)
    // Taket höjt 200→450 i P45: attrition.ts (P43), materielNeed-påfyllningen
    // (P44) och den behovsdrivna utlysningen (P45, ersätter en 35 %-chans) höjer
    // den naturliga wire-volymen per tur rejält — en faktion cyklar nu genom
    // utlys→förbruka→fyll på→utlys igen om och om under ett 20-tursparti (378
    // uppmätt här), i stället för den gamla slumpmässiga, sällsynta genereringen.
    // Fortfarande "långt under vad 20 obeskurna turer hade gett", bara en ny,
    // betydligt högre baslinje.
    expect(state.wire.length).toBeLessThan(450)
  })

  it('en syntetisk historik som spänner över långt fler än 8 turer, med grenande orsakskedjor: pruneWire lämnar aldrig en hängande referens', () => {
    // Bygger en bredare historik än vad P2:s egna no-op-pipeline kan producera:
    // flera oberoende kedjor, olika djup, och grenar (två händelser som delar
    // samma orsak). Det här är testet som faktiskt skulle fånga en regression i
    // beskärningslogiken.
    const wire: WireEvent[] = []
    function push(id: string, turn: number, causeId: string | null): void {
      wire.push({
        id,
        turn,
        severity: 'ticker',
        scope: 'global',
        headline: id,
        causeId,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
    }

    // Kedja A: en lång, oavbruten kedja över 25 turer.
    push('a-0', 0, null)
    for (let turn = 1; turn <= 25; turn++) {
      push(`a-${turn}`, turn, `a-${turn - 1}`)
    }

    // Kedja B: två händelser på samma tur som grenar ut från samma orsak.
    push('b-root', 10, null)
    push('b-left', 24, 'b-root')
    push('b-right', 24, 'b-root')

    for (let currentTurn = 0; currentTurn <= 30; currentTurn++) {
      const pruned = pruneWire(wire, currentTurn)
      assertNoDanglingCauseId(pruned)
    }
  })
})
