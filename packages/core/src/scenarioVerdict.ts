// scenarioVerdict — P89 (ETAPP7_TEKNISK_SPEC.md §9/§13, DESIGN.md §17, §6.3).
// Ren härledningsfunktion, aldrig lagrad i GameState — samma "härledd, inte
// lagrad"-princip som bidEstimate/ActionPreview (queries.ts). Räknar om alla
// fyra epilogaxlar (CAPITAL/REACH/SHADOW/RESTRAINT), slutkortet, vändpunkterna
// och (om partiet slutade i NUCLEAR_EXCHANGE) kärnvapenepilogen.
import { civilShare } from './civil.js'
import { cleanHouse } from './traces.js'
import type { ChronicleEntry, GameState, NuclearEpilogue, ScenarioVerdict } from './types.js'

// DESIGN.md §17, ordagrant: "CAPITAL slutkassa + tillgångar". house.commodityHoldings
// är redan i £ (Money), inte fysisk kvantitet (se applyActions.ts:s
// `house.commodityHoldings[commodity] += spend`) — ingen egen värderingsformel
// behöver uppfinnas, bara summeras med treasury.
function computeCapital(state: GameState): number {
  const holdings = Object.values(state.house.commodityHoldings).reduce((sum, v) => sum + v, 0)
  return state.house.treasury + holdings
}

// P89:s spec (§9) ställde frågan öppet: "REACH: verifiera först om uppfyllda
// kontrakt ligger kvar i state; annars läggs en mängd buyersServed till."
// Verifierat mot koden (deliveries.ts): `contract.status = 'fulfilled'` skriver
// aldrig ett splice/filter bort ur state.market.contracts — uppfyllda kontrakt
// ligger kvar. Ingen ny buyersServed-mängd behövs.
//
// "continents": ingen kontinentdata finns någonstans i kodbasen eller
// scenariodata (indochina-slice.json har bara teater-id:na "indochina"/"laos",
// båda Sydostasien). Löst med en liten, uttryckligen provisorisk lookup —
// inte gissad köpardata, bara verklig geografi för de teatrar som faktiskt
// finns. Ger ärligt continents=1 för indochina-slice, inte ett fabricerat tal.
const THEATRE_CONTINENT: Record<string, string> = {
  indochina: 'Asia',
  laos: 'Asia',
}

function computeReach(state: GameState): { buyers: number; continents: number } {
  const fulfilledBuyers = new Set(
    state.market.contracts.filter((c) => c.status === 'fulfilled').map((c) => c.buyerId),
  )
  const continents = new Set<string>()
  for (const theatre of Object.values(state.theatres)) {
    const continent = THEATRE_CONTINENT[theatre.id]
    if (continent) continents.add(continent)
  }
  return { buyers: fulfilledBuyers.size, continents: continents.size }
}

// DESIGN.md §17: "SHADOW kupper, incidenter, lönnmord — hur mycket av
// världen som är ditt verk." §9:s egen formulering är bredare: "räkna kind
// där actorIsPlayer" — utan att begränsa till bara de tre namngivna. Tolkat
// brett (alla krönikehändelser spelaren själv orsakat, inte bara de tre
// covert-op-kinderna) eftersom "hur mycket av världen som är ditt verk"
// rimligen omfattar även t.ex. ett kontrakt du vann eller en vapenvila du
// framtvingade — en uttrycklig tolkning, dokumenterad här, inte den enda
// möjliga läsningen.
function computeShadow(chronicle: readonly ChronicleEntry[]): number {
  return chronicle.filter((e) => e.actorIsPlayer).length
}

// "Vändpunkter": specen ger ingen egen rankningssignal utöver ChronicleEntry
// själv. |doomsdayDelta| är den enda kvantitativa allvarlighetssignal som
// finns på entryn — en rimlig, men inte den enda tänkbara, tolkning av
// "vändpunkt". Dokumenterat, samma anda som SHADOW ovan.
function computeTurningPoints(chronicle: readonly ChronicleEntry[]): ChronicleEntry[] {
  return [...chronicle]
    .sort((a, b) => Math.abs(b.doomsdayDelta) - Math.abs(a.doomsdayDelta))
    .slice(0, 3)
}

// DESIGN.md §6.3, ordagrant: "vad ditt hus levererade under de sista tolv
// turerna, vilka fronter som fanns, vilken enskild leverans som modellen kan
// spåra som utlösande, och en dödsruna över huset."
//
// Genuint fynd: wire.ts:s rullande fönster är WIRE_WINDOW_TURNS=8, inte 12 —
// och ordinarie ("DELIVERED ...") leveranshändelser hamnar aldrig i
// GameState.chronicle (bara restricted_delivery gör, se chronicle.ts:s egen
// kommentar) — det finns alltså ingen lagrad 12-turershistorik av vanliga
// leveranser någonstans i GameState. Att utöka chronicle till att spara VARJE
// leverans skulle svämma över dess 80-tak, avsett för notabla händelser, inte
// rutinleveranser. Löst genom att läsa det som faktiskt finns kvar i
// state.wire (upp till 8 turer bakåt, inte 12) — ärligt kortare än specens
// text, dokumenterat här snarare än att låtsas täcka tolv turer.
function buildNuclearEpilogue(state: GameState, endingTurn: number): NuclearEpilogue {
  const deliveries = state.wire
    .filter((e) => e.turn > endingTurn - 12 && e.actorIsPlayer && e.headline.startsWith('DELIVERED '))
    .map((e) => e.headline)

  const frontNames = Object.values(state.theatres).map((t) => t.name)

  const triggeringEntry =
    [...state.chronicle].reverse().find((e) => e.actorIsPlayer && e.doomsdayDelta > 0) ?? null

  const obituary = triggeringEntry
    ? `${state.house.name.toUpperCase()} ceases operations. Doomsday reached ${state.doomsday}%, ` +
      `traced to: ${triggeringEntry.headline}.`
    : `${state.house.name.toUpperCase()} ceases operations. Doomsday reached ${state.doomsday}%.`

  return { deliveriesLastTwelveTurns: deliveries, frontNames, triggeringEntry, obituary }
}

const ENDING_HEADLINES: Record<string, string> = {
  NUCLEAR_EXCHANGE: 'NUCLEAR EXCHANGE',
  EXPOSURE: 'EXPOSED — LICENCE REVOKED',
  INSOLVENCY: 'LIQUIDATED — INSOLVENT',
  BUYOUT: 'SOLD — BOARD TARGET MISSED',
  SCENARIO_COMPLETE: 'SCENARIO COMPLETE',
}

export function scenarioVerdict(state: GameState): ScenarioVerdict {
  const ending =
    state.status.kind === 'ended'
      ? {
          code: state.status.ending,
          headline: `${state.house.name.toUpperCase()}: ${ENDING_HEADLINES[state.status.ending]}`,
          turn: state.status.turn,
        }
      : null

  return {
    capital: computeCapital(state),
    reach: computeReach(state),
    shadow: computeShadow(state.chronicle),
    restraint: state.doomsdayPeak,
    ending,
    turningPoints: computeTurningPoints(state.chronicle),
    nuclearEpilogue: ending?.code === 'NUCLEAR_EXCHANGE' ? buildNuclearEpilogue(state, ending.turn) : null,
    cleanHouse: cleanHouse(state),
    civilSharePct: civilShare(state),
  }
}
