// newsClassification.ts — P81d (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten).
// "Allt är presentation: vilken händelsetyp som hör till vilken nivå och
// avdelning är en tabell i packages/app" — ren, testbar, rör aldrig
// packages/core eller WireEvent självt.
import { HISTORY_CAUSE_PREFIX, historyEventOf } from '@seventh-front/core'
import type { GameState, HistoryEvent, WireEvent } from '@seventh-front/core'
import { wireAnchor } from './wireAnchor.js'

// P81-blockquoten, ordagrant: "front byter status, sektor byter sida, kupp,
// lönnmord, embargo, kris och styrelsens dom." Ingen strukturerad `kind`
// finns på WireEvent (bara fri text) — mönstren är hämtade direkt ur de
// faktiska emit()-anropen (factions.ts, political.ts, politics.ts, board.ts,
// doomsday.ts, fronts.ts, endings.ts), verifierade mot ett riktigt
// 20-tursparti (`resolveTurn`, seed `flash-probe-1`), inte gissade.
//
// Tre genuina fynd vid den verifieringen, utanför den ordagranna listan men
// inom dess ANDA ("stanna, beskriv, föreslå" — CLAUDE.md):
// 1. "Sektor byter sida" har ingen egen händelse (P82s redeploy-mekanik, se
//    P81a:s kommentar) — men fronts.ts:s BREAKTHROUGH-rubrik ("POSITION
//    SHIFTS TOWARD SIDE") är den närmaste befintliga motsvarigheten: en
//    TRÖSKELhändelse ("bara när obalansen passerar tröskeln, inte varje
//    tur", fronts.ts:s egen kommentar), inte en rutinhändelse — provet
//    triggade den EN gång på 20 turer. Tillagd.
// 2. "Styrelsens dom" är tvetydigt mellan granskningskontrollerna (redan
//    med, BOARD REVIEW) och det FAKTISKA slutgiltiga utfallet — endings.ts:s
//    fem slutrubriker (NUCLEAR EXCHANGE, EXPOSED, LIQUIDATED, SOLD, SCENARIO
//    COMPLETE) är rimligare läst som "domen" i den meningen ordet oftast
//    används (spelet TAR SLUT). Alla fem tillagda.
// 3. En faktions konkurs ("BANKRUPT — ALL CONTRACTS VOIDED", factions.ts)
//    dök upp i samma 20-tursprov — en lika stor lägesändring som embargo,
//    bara inte namngiven i den ursprungliga listan. Tillagd.
// 4. P82 (beslut 2F, ETAPP7_TEKNISK_SPEC.md §2F): "sektor byter sida" fick
//    sin FÖRSTA riktiga mekanik — REDEPLOYS-rubriken (fronts.ts, emitterad
//    på samma genombrottströskel som redan finns i fynd 1 ovan) är den
//    bokstavliga händelsen listan redan namngav, tillagd här i samma commit
//    som mekaniken (CLAUDE.md: "en ändrad spec utan loggrad är samma sak som
//    ingen ändring" — samma princip för en ny händelsetyp i den här tabellen).
const FLASH_PATTERNS: RegExp[] = [
  /^CEASEFIRE ON THE/, // front byter status: krig → vapenvila
  /^WAR RESUMES ON THE/, // front byter status: vapenvila → krig
  /^BREAKTHROUGH ON THE .+ FRONT — POSITION SHIFTS/, // sektor/front byter läge (genuint fynd 1)
  /REDEPLOYS .+ AFTER THE BREAKTHROUGH$/, // förband byter SEKTOR (P82, beslut 2F — sektor byter sida, ordagrant)
  /FUNDS A SUCCESSFUL COUP IN/, // kupp, lyckad
  /COUP ATTEMPT IN .+ FAILS/, // kupp, misslyckad
  /HAS .+ ASSASSINATED/, // lönnmord
  /ISSUES EMBARGO/, // embargo (politics.ts:s PolicyDecision-headline)
  // P99b (ägarbeslut 2026-09-29, RAPPORT3 §6 "ingen förlust utan en varning i THE WIRE minst en tur
  // innan"): varningen turen före ett policybeslut. Måste hamna på förstasidan — spelaren ska hinna
  // agera på den. Bara headline-tier (isFlashEvent kräver det), precis som beslutet den varnar för.
  / IS PREPARING .+ — RELATIONS BELOW \d+/,
  /BANKRUPT — ALL CONTRACTS VOIDED/, // faktionskonkurs (genuint fynd 3)
  /^CRISIS —/, // kris, spelarens val krävs
  /^CRISIS WATCH —/, // kris, förvarning
  /BOARD REVIEW \(TURN \d+\): ON TRACK/, // granskning godkänd
  /BOARD REVIEW FAILED \(TURN \d+\)/, // granskning underkänd
  // Styrelsens FAKTISKA dom — spelets fem slutrubriker (endingHeadline,
  // endings.ts), genuint fynd 2:
  /^NUCLEAR EXCHANGE$/,
  /EXPOSED — LICENCE REVOKED$/,
  /LIQUIDATED — INSOLVENT$/,
  /SOLD — BOARD TARGET MISSED$/,
  /: SCENARIO COMPLETE$/,
]

// P149: förstasidan en rubrik hör till (annars null) — rubrikhändelsen bär deltat history.<id>, effekterna gör det inte.
export function historyFrontPage(event: WireEvent): HistoryEvent | null {
  if (!Object.keys(event.delta).some((k) => k.startsWith('history.'))) return null
  const found = historyEventOf(event.causeId, event.delta)
  return found?.kind === 'frontPage' ? found : null
}

export function isFlashEvent(event: WireEvent): boolean {
  if (event.severity !== 'headline') return false
  if (historyFrontPage(event) !== null) return true // P149: en förstasida ur historien är alltid en blixt
  return FLASH_PATTERNS.some((pattern) => pattern.test(event.headline))
}

// P81d, ordagrant: "grupperade under fasta avdelningar (Dina affärer,
// Fronten, Politik, Marknaden)." wireAnchor (P80) avgör redan sector/hud
// tillförlitligt (strukturerad, inte textbaserad); country/station är
// tvetydigt (political.ts OCH rivals.ts:s incidenter delar scope:'faction'
// med bidding.ts/deliveries.ts) — men `event.scope === 'market'` är en
// redan strukturerad, konsekvent markering för just handelshändelser
// (bidding.ts/orders.ts/deliveries.ts/rivals.ts:s marknadsgrenar, verifierat
// mot koden). Allt annat riktat mot ett land är politik/underrättelse.
export type NewsDepartment = 'business' | 'front' | 'politics' | 'market' | 'world'

export const NEWS_DEPARTMENTS: { id: NewsDepartment; label: string }[] = [
  { id: 'business', label: 'Your Business' },
  { id: 'front', label: 'The Front' },
  { id: 'politics', label: 'Politics' },
  { id: 'market', label: 'The Market' },
  // P149 (ETAPP10 §9.5): verkliga, daterade händelser ur data/history — känns igen på causeId-prefixet history:, aldrig på texten.
  { id: 'world', label: 'World' },
]

export function newsDepartment(state: GameState, event: WireEvent): NewsDepartment {
  if (event.causeId?.startsWith(HISTORY_CAUSE_PREFIX)) return 'world'
  const anchor = wireAnchor(state, event)
  if (anchor.kind === 'sector') return 'front'
  if (anchor.kind === 'hud') return 'business'
  return event.scope === 'market' ? 'market' : 'politics'
}

// P81-9 (speltestet): "340 events och 26 headlines bara ett par turer in är
// alldeles för mycket." De flesta av de 340 är rutin-tickers (ränta,
// underhåll, avsvalning) som upprepas nästan varje tur med bara siffrorna
// ändrade. En normaliserad mall (siffror/belopp maskade) grupperar samma
// TYP av rad, oavsett vilket tal den råkade visa den turen.
export function normalizeHeadlineTemplate(headline: string): string {
  return headline.replace(/£[\d,]+(\.\d+)?/g, '£#').replace(/\d+(\.\d+)?/g, '#')
}

export interface TickerGroup {
  template: string
  events: WireEvent[]
}

// Grupperar TICKER-händelser (bara ticker — headline/report visas
// individuellt, se TheWire.tsx) efter normaliserad mall, nyaste händelse
// per grupp sist i `events`.
export function groupTickers(events: readonly WireEvent[]): TickerGroup[] {
  const order: string[] = []
  const map = new Map<string, WireEvent[]>()
  for (const event of events) {
    const key = normalizeHeadlineTemplate(event.headline)
    const bucket = map.get(key)
    if (bucket) {
      bucket.push(event)
    } else {
      map.set(key, [event])
      order.push(key)
    }
  }
  return order.map((template) => ({ template, events: map.get(template)! }))
}
