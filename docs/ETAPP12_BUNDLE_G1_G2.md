# ETAPP 12 — KRIGSRUMMET (PC WIDESCREEN) & GEMINI BUNDLE G1–G2

> **DIREKTIV TILL CLAUDE CODE:**
> Detta enda dokument innehåller både:
> 1. **Den tekniska specifikationen för Etapp 12 (P192–P198)** och arbetsfördelningen mellan Gemini och Claude Code.
> 2. **Den färdiga produktionskoden för Paket G1 och Paket G2** (4 filer under `packages/app/src/`), inbäddade längst ner i detta dokument mellan `=== BEGIN FILE: <sökväg> ===` och `=== END FILE ===`.
>
> **När du kör P193 ska du:**
> - Läsa de 4 inbäddade filerna i slutet av detta dokument och skriva ut dem **ordagrant (tecken för tecken)** till sina angivna sökvägar i `packages/app/src/` utan att förenkla, stryka eller rita om deras JSX, SVG eller CSS.
> - Därefter koppla in dem i `App.tsx`, `Shell.tsx`, `TheatreMap.tsx` och `main.tsx` enligt instruktionerna i P193.

---

## 0. Briefing till Claude Code — Arbetsfördelning

Den här etappen genomförs i ett **delat arbetsflöde** mellan Gemini (Visuell Arkitekt) och Claude Code (Systemintegratör) för att lösa det huvudproblem som identifierats under speltestning: att spelet hittills har känts som ett platt kalkylark/webbformulär istället för ett levande strategispel i stil med *Radio General*.

### Varför arbetsfördelningen ser ut som den gör
Under tidigare etapper (P76–P80) fattade kodsessioner i Claude Code defensiva förenklingsbeslut som skadade spelkänslan:
1. I `TheatreMap.tsx` reducerades referensskissens taggiga fettkrits-frontlinje till en enda cirkel på 4 pixlar (`<circle r={4} />`).
2. I `QuarterReplay.tsx` valdes kartanimering bort i en kodkommentar till förmån för en platt textlista (`<ol className="replay-list">`).
3. `MovementArrow.tsx` (byggd i P41) kopplades aldrig in trots att `fronts.ts` (`redeployAfterBreakthrough`) genererar faktiska förbandsförflyttningar.
4. I `App.tsx` avmonteras `<TheatreMap>` så fort spelaren byter till `contracts`, `company`, `contacts` eller `news`, vilket ersätter spelbordet med fullbreddstabeller (`<table>`).

### Hårda samarbetsregler för Claude Code i Etapp 12
1. **Ägaren levererar 5 färdiga visuella moduler (Paket G1–G5, skrivna av Gemini) via samlade bundle-dokument.**
2. **DU FÅR INTE FÖRENKLA, KRYMPA ELLER RITA OM GEMINIS LEVERERADE SVG-, CSS- ELLER KOMPONENTSTRUKTUR.** Om ett befintligt test i `packages/app/test/` eller `packages/app/e2e/` faller på grund av att en gammal flik eller platt tabell ersatts av krigsbordet, ska **testet** uppdateras till den nya komponenten — du får aldrig nedgradera den visuella komponenten för att passa ett gammalt test.
3. **Rör ALDRIG `packages/core/src/resolve/`, `balance.json` eller golden-snapshoten.**

---

## 1. Ägarbeslut (12A–12F) — Läggs i `docs/ANDRINGSLOGG.md` i P192

- **12A — PC Widescreen först, mobilversionen läggs på is.** Regel 10 i `CLAUDE.md` ("Mobil först, 390×844") och Regel 13 ("Ingen information bara vid hovring") upphävs. Standardformatet är **PC Widescreen (1440×900 och 1920×1080)**. `scripts/shots.mjs` och Playwright-testerna i `packages/app/e2e/` körs enbart mot desktop-viewport (`1440×900`).
- **12B — Diegetiskt skrivbord i *Radio General*-stil ersätter femfliksskalet.** `<TheatreMap>` avmonteras aldrig under pågående parti. Skärmen är ett sammanhängande direktionsbord där kartan alltid ligger fastnålad på vänstra/mellersta delen av bordet (ca 58 % bredd) och alla arbetsvyer (`Tenders/Contracts`, `The Works`, `Dossiers/Contacts`, `The Wire & Ledger`) öppnas som fysiska, staplade manillamappar och blåkopior på bordets högra sida (ca 42 % bredd).
- **12C — Röda karttrådar vid hovring (`DeskYarn`).** När spelaren hovrar över eller väljer ett orderkort, en tjänsteman, ett utbox-kort eller en rad på kvartalets skrivblock (`This Quarter`), ritas en fysisk röd tråd/peklinje i realtid från DOM-elementet i mappen till exakt rätt DOM-nod (`[data-map-node="<id>"]`) på kartan via `getBoundingClientRect()`.
- **12D — Rik militär generalstabskarta (1965) + Dynamiska världsspår.** Bas-kartan byggs ut med topografiska höjdkurvor, flodsystem (Mekong + Röda floden), huvudvägar (Route 1, Route 9, Route 13), flyg-/flottbaser och militär kartusch. Förband ritas som fysiska 3D-pappbrickor ("Wargame Chits"). Världsläget (`supplyLines.ts`, `Theatre.heat`, `Faction.embargoed`, `GameState.history`, `foreignWorks`) ritar ut fysiska fraktfartyg till havs, stridsärr vid hög `heat`, fastnålade historiska händelsekort och embargostämplar över stängda hamnar.
- **12E — Kvartalsuppspelningen sker på kartan (`MapQuarterReplay` + `MovementArrow`).** Den gamla textlistan i `QuarterReplay.tsx` ersätts av en koreograferad uppspelning direkt på `<TheatreMap>` där leveranser rör sig längs rutterna, strider blixtrar i sektorer, fettkrits-frontlinjen flyttar sig och `MovementArrow.tsx` ritas ut när förband omgrupperar (`REDEPLOY`).
- **12F — Fysiskt stämpelverktyg (`RubberStampTool`) och fastgemade porträtt.** Att skicka in ett bud eller arkivera en order sker genom ett fysiskt stämpelverktyg där muspekaren blir en trästämpel som vid klick lämnar ett slitet bläckavtryck (`public/art/wear/ink-wear-1..6.svg`) på dokumentet. Befintliga SVG-porträtt (`public/art/portraits/*.svg`) och sigill (`public/art/seals/*.svg`) monteras med fysiska gem på person- och rivalakterna.

---

## 2. Promptsekvens (P192–P198)

### P192 — Nya PC-regler, viewport-skifte och testinfrastruktur (Claude Code)
1. Uppdatera `CLAUDE.md` ("Spelgränssnitt — regler"):
   - Ersätt Regel 10 med: *"10. PC Widescreen först. Varje skärm byggs för 1440×900 (och skalas upp till 1920×1080) som ett sammanhängande krigsbord där kartan alltid ligger synlig till vänster och arbetsmapparna till höger."*
   - Ersätt Regel 13 med: *"13. Hovring på skrivbordet spänner en röd karttråd (`DeskYarn`) till berörd plats eller förband på kartan; ett klick låser markeringen."*
   - Uppdatera Regel 17 så att `npm run shots` bara tar desktop-skärmbilder (`1440×900`).
2. Lägg in ägarbesluten **12A–12F** i `docs/ANDRINGSLOGG.md`.
3. Uppdatera `packages/app/playwright.config.ts`, `packages/app/e2e/screens.ts`, `packages/app/e2e/text-overflow.spec.ts` och `packages/app/scripts/shots.mjs` så att telefon-viewporten (`390×844`) tas bort och desktop-viewporten sätts till `1440×900`.
4. **Klart när:** `npm test` och `npm run test:e2e` går igenom i `1440×900`.

### P193 — Skrivbordsskalet (`DeskWorkspace`) och Röda Tråden (`DeskYarn`) (Paket G1+G2 nedan)
1. Skriv ut de 4 inbäddade filerna i **Paket G1 & G2** längst ner i detta dokument ordagrant till sina sökvägar:
   - `packages/app/src/deskYarnContext.ts`
   - `packages/app/src/components/DeskYarn.tsx`
   - `packages/app/src/components/DeskWorkspace.tsx`
   - `packages/app/src/styles/desk-war-room.css`
2. Importera `./styles/desk-war-room.css` i `packages/app/src/main.tsx` (direkt efter `./styles.css`).
3. Bygg om `packages/app/src/App.tsx` så att in-game-vyerna (`operations`, `contracts`, `company`, `contacts`, `news`) omsluts av `<DeskYarnProvider>` och `<DeskWorkspace>`:
   - `mapSlot` får `<TheatreMap state={state} selectedFactionId={selectedFactionId} onSelectCountry={setSelectedFactionId} />` (så att kartan ALDRIG avmonteras när `view` ändras!).
   - `countryFileSlot` får `<CountryFile ... />` när `selectedFactionId !== null`.
   - `folderContentSlot` får `<TheFloor />` (`view === 'contracts'`), `<TheHouse />` (`view === 'company'`), `<ThePolitics />` (`view === 'contacts'`) eller `<TheWire />` (`view === 'news'`).
   - `bannerSlot` får `ended`-bannern, `<RejectedBanner>`, `<TutorialOverlay>` och `<ArmedVerbStrip>`.
   - Ta bort den gamla dubbla `ds-end-quarter-fallback`-knappen ur `App.tsx` eftersom `<DeskWorkspace>` alltid har bordskalendern (`data-testid="end-quarter-button"`) synlig nere till höger oavsett vilken mapp som är öppen.
4. Koppla `useDeskYarn()` (`connectYarn`/`clearYarn` + `yarnTargetForOrder`) på `.order-folder` i `TheFloor.tsx` och på `.faction-card` i `ThePolitics.tsx`.
5. **Klart när:** Kartan ligger kvar till vänster oavsett vilken mapp som öppnas till höger, hovring ritar den röda tråden till rätt nod på kartan, och samtliga tester i `packages/app/test/` är gröna.

### P194–P197 — Kommande Gemini-bundle (G3, G4, G5)
- **P194:** Militärkartan 1965, fettkrits-frontlinjer och 3D-Chits (`RichTheatreMap.tsx` + `mapMilitaryOverlay.ts`, Paket G4 del A).
- **P195:** Dynamiska världsspår på kartan: fartyg till havs, stridsärr efter `heat`, embargostämpel och fastnålade historiska kort (Paket G4 del B).
- **P196:** Koreograferad kvartalsuppspelning direkt på kartan + `MovementArrow.tsx` (`MapQuarterReplay.tsx`, Paket G5).
- **P197:** Fysiskt stämpelverktyg och fastgemade porträtt (`RubberStampTool.tsx` + `PaperclipPhoto.tsx`, Paket G3).
- **P198:** Slutligt testsvep, `npm run shots` och verifiering av orörd golden-snapshot.

---

# INBÄDDADE FILER FÖR PAKET G1 & G2 (PACKAS UPP I P193)

=== BEGIN FILE: packages/app/src/deskYarnContext.ts ===
// deskYarnContext.ts — Paket G2 (ETAPP 12, 12C): datamodell och React-context
// för den fysiska röda karttråden (DeskYarn) som spänns över skrivbordet vid
// hovring på ordermappar, larmrader på skrivblocket, tjänstemän eller
// köade handlingskort i Outbox-korgen.
import { createContext, useContext } from 'react'
import type { GameState, Order, PlayerAction } from '@seventh-front/core'
import type { ThisQuarterItem } from './thisQuarter.js'

export interface DeskYarnConnection {
  sourceEl: HTMLElement
  targetId: string
  tone?: 'red' | 'amber' | 'blue'
}

export interface DeskYarnContextValue {
  connection: DeskYarnConnection | null
  connectYarn: (sourceEl: HTMLElement, targetId: string, tone?: 'red' | 'amber' | 'blue') => void
  clearYarn: () => void
}

export const DeskYarnContext = createContext<DeskYarnContextValue>({
  connection: null,
  connectYarn: () => {},
  clearYarn: () => {},
})

export function useDeskYarn(): DeskYarnContextValue {
  return useContext(DeskYarnContext)
}

export function yarnTargetForThisQuarter(item: ThisQuarterItem, state: GameState): string | null {
  if (item.id.startsWith('order-')) {
    const orderId = item.id.slice('order-'.length)
    const order = state.market.openOrders.find((o) => o.id === orderId)
    if (order) return yarnTargetForOrder(order, state)
  }
  if (item.id.startsWith('station-')) {
    const stationId = item.id.slice('station-'.length)
    const station = state.house.stations.find((s) => s.id === stationId)
    if (station) return station.nation
  }
  if (item.id.startsWith('official-')) {
    const officialId = item.id.slice('official-'.length)
    const official = state.officials[officialId]
    if (official) return official.factionId
  }
  if (item.id.startsWith('contract-')) {
    const contractId = item.id.slice('contract-'.length)
    const contract = state.market.contracts.find((c) => c.id === contractId)
    if (contract) return contract.frontId ?? contract.buyerId
  }
  if (item.target.view === 'operations') {
    return item.target.factionId
  }
  return null
}

export function yarnTargetForOrder(order: Order, state?: GameState): string {
  if (state && order.frontId) {
    const front = state.fronts[order.frontId]
    const buyerSide = front?.sideA === order.buyerId ? 'a' : front?.sideB === order.buyerId ? 'b' : null
    const mauled = front?.formations.find((f) => f.side === buyerSide && f.status === 'mauled')
    if (mauled) return mauled.id
  }
  return order.frontId ?? order.buyerId
}

export function yarnTargetForAction(action: PlayerAction, state: GameState): string | null {
  switch (action.type) {
    case 'INTEL': {
      if (action.op === 'RECRUIT' && action.targetId) return action.targetId
      const station = state.house.stations.find((s) => s.id === station.id)
      return station?.nation ?? null
    }
    case 'POLITICAL': {
      if ('officialId' in action) {
        return state.officials[action.officialId]?.factionId ?? null
      }
      return action.targetFactionId
    }
    case 'BROKER':
      return action.buyerId
    default:
      return null
  }
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/DeskYarn.tsx ===
// DeskYarn.tsx — Paket G2 (ETAPP 12, 12C): ritar den fysiska röda karttråden
// från ett hovrat dokument/kort på skrivbordet till exakt rätt DOM-nod på
// TheatreMap. Använder getBoundingClientRect() + MutationObserver på kartans
// zoom-grupp så att tråden aldrig pekar utanför kartan eller tappar synk vid
// panorering/zoom.
import { useCallback, useEffect, useId, useLayoutEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { DeskYarnContext } from '../deskYarnContext.js'
import type { DeskYarnConnection } from '../deskYarnContext.js'

const COUNTRY_BY_FACTION: Record<string, string> = {
  rvn: 'south-vietnam',
  laos: 'laos',
}

export function resolveMapTargetElement(targetId: string): Element | null {
  if (typeof document === 'undefined' || !targetId) return null
  const selectors = [
    `[data-map-node="${targetId}"]`,
    `[data-testid="map-formation-${targetId}"]`,
    `[data-testid="map-capital-${targetId}"] .map-capital-marker`,
    `[data-testid="map-capital-${targetId}"]`,
    `[data-testid="map-landless-${targetId}"]`,
    `[data-testid="map-sector-${targetId}"]`,
    `[data-testid="map-frontline-marker-${targetId}"]`,
    `[data-testid="map-frontline-${targetId}"]`,
    `[data-testid="map-works-${targetId}"]`,
  ]
  const mappedCountry = COUNTRY_BY_FACTION[targetId]
  if (mappedCountry) {
    selectors.push(`[data-testid="map-country-${mappedCountry}"]`)
  }
  selectors.push(`[data-testid="map-country-${targetId}"]`)

  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

interface YarnGeometry {
  startX: number
  startY: number
  endX: number
  endY: number
  controlX: number
  controlY: number
  tone: 'red' | 'amber' | 'blue'
}

function computeYarnGeometry(conn: DeskYarnConnection | null): YarnGeometry | null {
  if (!conn || !conn.sourceEl.isConnected) return null
  const targetEl = resolveMapTargetElement(conn.targetId)
  if (!targetEl) return null

  const mapContainer = document.querySelector('[data-testid="theatre-map"] .map-svg')
  const sourceRect = conn.sourceEl.getBoundingClientRect()
  const targetRect = targetEl.getBoundingClientRect()

  if (sourceRect.width === 0 && sourceRect.height === 0) return null
  if (targetRect.width === 0 && targetRect.height === 0) return null

  const endX = targetRect.left + targetRect.width / 2
  const endY = targetRect.top + targetRect.height / 2

  let clampedEndX = endX
  let clampedEndY = endY
  if (mapContainer) {
    const mapRect = mapContainer.getBoundingClientRect()
    clampedEndX = Math.max(mapRect.left + 14, Math.min(mapRect.right - 14, endX))
    clampedEndY = Math.max(mapRect.top + 14, Math.min(mapRect.bottom - 14, endY))
  }

  const startOnLeft = sourceRect.left > clampedEndX
  const startX = startOnLeft ? sourceRect.left + 6 : sourceRect.right - 6
  const startY = sourceRect.top + Math.min(24, sourceRect.height / 2)

  const dist = Math.hypot(clampedEndX - startX, clampedEndY - startY)
  const arcLift = Math.min(68, Math.max(22, dist * 0.14))
  const controlX = (startX + clampedEndX) / 2
  const controlY = Math.min(startY, clampedEndY) - arcLift

  return {
    startX,
    startY,
    endX: clampedEndX,
    endY: clampedEndY,
    controlX,
    controlY,
    tone: conn.tone ?? 'red',
  }
}

export function DeskYarnProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<DeskYarnConnection | null>(null)
  const [geometry, setGeometry] = useState<YarnGeometry | null>(null)
  const filterId = useId()

  const connectYarn = useCallback((sourceEl: HTMLElement, targetId: string, tone?: 'red' | 'amber' | 'blue') => {
    setConnection({ sourceEl, targetId, tone })
  }, [])

  const clearYarn = useCallback(() => {
    setConnection(null)
  }, [])

  useLayoutEffect(() => {
    setGeometry(computeYarnGeometry(connection))
  }, [connection])

  useEffect(() => {
    if (!connection) return
    const update = () => setGeometry(computeYarnGeometry(connection))

    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    const svgGroup = document.querySelector('.map-svg > g')
    let observer: MutationObserver | null = null
    if (svgGroup && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(update)
      observer.observe(svgGroup, { attributes: true, attributeFilter: ['transform'] })
    }

    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      observer?.disconnect()
    }
  }, [connection])

  return (
    <DeskYarnContext.Provider value={{ connection, connectYarn, clearYarn }}>
      {children}
      {geometry && (
        <svg className="desk-yarn-overlay" data-testid="desk-yarn-overlay" aria-hidden="true">
          <defs>
            <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="0" dy="4" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.55" />
            </filter>
          </defs>
          <g filter={`url(#${filterId})`} className={`desk-yarn-group is-${geometry.tone}`}>
            <path
              d={`M ${geometry.startX.toFixed(1)}${geometry.startY.toFixed(1)} Q ${geometry.controlX.toFixed(1)}${geometry.controlY.toFixed(1)} ${geometry.endX.toFixed(1)}${geometry.endY.toFixed(1)}`}
              className="desk-yarn-line"
              data-testid="desk-yarn-line"
            />
            <circle cx={geometry.startX} cy={geometry.startY} r={4.5} className="desk-yarn-pin-start" />
            <circle cx={geometry.endX} cy={geometry.endY} r={14} className="desk-yarn-target-halo" />
            <circle cx={geometry.endX} cy={geometry.endY} r={4} className="desk-yarn-pin-end" />
          </g>
        </svg>
      )}
    </DeskYarnContext.Provider>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/components/DeskWorkspace.tsx ===
// DeskWorkspace.tsx — Paket G1 (ETAPP 12, 12A/12B): det diegetiska PC-krigsrummet
// i Radio General-stil. Ersätter det gamla mobil-först-skalet med ett fysiskt
// mahognyskrivbord där kartan alltid ligger fastnålad på vänstra bordshalvan
// och arbetsmapparna (Contracts, Company/Works, Contacts/Dossiers, News/Wire
// samt CountryFile) ligger som fysiska manillamappar på den högra bordshalvan.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { boardReviewOutlook, DISPLAY_THRESHOLDS, getProduct } from '@seventh-front/core'
import type { FactionId, GameState, PlayerAction } from '@seventh-front/core'
import { actionSummary, DoomsdayGauge, TABS } from './Shell.js'
import type { ShellView } from './Shell.js'
import { ActionSlot, InfoTooltip } from './designSystem.js'
import { formatMoney } from './ui.js'
import { HANDBOOK, hudNumberTopic } from '../handbook.js'
import type { HandbookTopicId } from '../handbook.js'
import { deriveQuarterlyNotice, deriveThisQuarter } from '../thisQuarter.js'
import type { ThisQuarterTarget } from '../thisQuarter.js'
import type { DatedMemo } from '../memos.js'
import { useDeskYarn, yarnTargetForAction, yarnTargetForOrder, yarnTargetForThisQuarter } from '../deskYarnContext.js'

function hudSummary(id: Parameters<typeof hudNumberTopic>[0]): string {
  const topic = hudNumberTopic(id)
  return HANDBOOK.find((entry) => entry.id === topic)?.summary ?? ''
}

function doomsdayTone(value: number): string {
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'is-danger'
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'is-amber'
  return ''
}

function splitFlapDigits(amount: number): { sign: string; digits: string[]; suffix: string } {
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(2)
    return { sign, digits: m.split(''), suffix: 'M' }
  }
  const k = Math.round(abs / 1_000).toString().padStart(3, '0')
  return { sign, digits: k.split(''), suffix: 'K' }
}

function TheatreOperationsBrief({
  state,
  onSelectCountry,
  onSelectView,
}: {
  state: GameState
  onSelectCountry: (factionId: FactionId) => void
  onSelectView: (view: ShellView) => void
}) {
  const { connectYarn, clearYarn } = useDeskYarn()
  const fronts = Object.values(state.fronts)
  const openOrders = state.market.openOrders

  return (
    <div className="desk-ops-brief" data-testid="desk-operations-brief">
      <div className="desk-folder-header">
        <div>
          <span className="desk-kicker">OPERATIONAL SITUATION SUMMARY · HOVER ANY CARD TO TRACE ON MAP</span>
          <h2 className="desk-folder-title">INDOCHINA &amp; LAOS THEATRES</h2>
        </div>
        <span className="desk-rubber-stamp is-amber">
          {state.meta.year} · Q{state.meta.quarter}
        </span>
      </div>

      <div className="desk-section-label">ACTIVE FRONTS &amp; FORMATIONS</div>
      <div className="desk-card-list">
        {fronts.map((front) => {
          const theatre = state.theatres[front.theatreId]
          const sideA = state.factions[front.sideA]
          const sideB = state.factions[front.sideB]
          const mauledCount = front.formations.filter((f) => f.status === 'mauled').length
          return (
            <div
              key={front.id}
              className="desk-index-card is-interactive"
              onMouseEnter={(e) => connectYarn(e.currentTarget, front.id, 'red')}
              onMouseLeave={clearYarn}
              onClick={() => onSelectCountry(front.sideA)}
              data-testid={`desk-front-card-${front.id}`}
            >
              <div className="desk-card-top">
                <span className="desk-mono-label">
                  {theatre?.name ?? front.theatreId.toUpperCase()} · HEAT {Math.round(theatre?.heat ?? 0)}/100
                </span>
                <span className={`desk-rubber-stamp ${front.status === 'war' ? 'is-red' : 'is-green'}`}>
                  {front.status.toUpperCase()}
                </span>
              </div>
              <div className="desk-card-main">
                <strong>
                  {sideA?.name ?? front.sideA} vs. {sideB?.name ?? front.sideB}
                </strong>
                <span className="desk-mono-val">Pos {front.position > 0 ? `+${front.position}` : front.position}</span>
              </div>
              <div className="desk-card-sub">
                Strength {Math.round(front.strength.a)} : {Math.round(front.strength.b)}
                {mauledCount > 0 ? ` · ${mauledCount} formation${mauledCount === 1 ? '' : 's'} MAULED` : ' · All formations intact'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="desk-section-label">BUYER CAPITAL FILES (CLICK TO OPEN COUNTRY DOSSIER)</div>
      <div className="desk-buyer-grid">
        {Object.values(state.factions).map((faction) => {
          const station = state.house.stations.find((s) => s.nation === faction.id && s.status === 'active')
          const ordersHere = openOrders.filter((o) => o.buyerId === faction.id).length
          return (
            <button
              key={faction.id}
              type="button"
              className="desk-buyer-card"
              onMouseEnter={(e) => connectYarn(e.currentTarget, faction.id, 'amber')}
              onMouseLeave={clearYarn}
              onClick={() => onSelectCountry(faction.id)}
              data-testid={`desk-open-country-${faction.id}`}
            >
              <div className="desk-card-top">
                <strong>{faction.name}</strong>
                {faction.embargoed && <span className="desk-rubber-stamp is-red">EMBARGO</span>}
              </div>
              <div className="desk-card-sub">
                Relation {Math.round(faction.relationToPlayer)}/100 · {station ? `${station.city} D${station.depth}` : 'No Station'}
              </div>
              <div className="desk-mono-label" style={{ color: 'var(--amber-ink)', marginTop: 4 }}>
                {ordersHere} Open Tender{ordersHere === 1 ? '' : 's'} ▸
              </div>
            </button>
          )
        })}
      </div>

      {openOrders.length > 0 && (
        <>
          <div className="desk-section-label">URGENT PROCUREMENT TENDERS ({openOrders.length})</div>
          <div className="desk-card-list">
            {openOrders.slice(0, 3).map((order) => {
              const product = getProduct(order.productId)
              const buyer = state.factions[order.buyerId]
              return (
                <div
                  key={order.id}
                  className="desk-index-card is-interactive"
                  onMouseEnter={(e) => connectYarn(e.currentTarget, yarnTargetForOrder(order, state), 'amber')}
                  onMouseLeave={clearYarn}
                  onClick={() => onSelectView('contracts')}
                >
                  <div className="desk-card-main">
                    <strong>
                      {order.quantity}× {product.name}
                    </strong>
                    <span className="desk-mono-val">{formatMoney(order.statedBudget)}</span>
                  </div>
                  <div className="desk-card-sub">
                    Buyer: {buyer?.name ?? order.buyerId} · Click to open Contracts folder ▸
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export interface DeskWorkspaceProps {
  state: GameState
  activeView: ShellView
  onSelectView: (view: ShellView) => void
  selectedFactionId: FactionId | null
  onSelectCountry: (factionId: FactionId | null) => void
  actions: PlayerAction[]
  onRemoveAction: (index: number) => void
  onOpenCatalog: () => void
  onEndTurn: () => void
  ended: boolean
  memos: readonly DatedMemo[]
  onOpenMemo: (id: string) => void
  onNavigateQuarterItem: (target: ThisQuarterTarget) => void
  onOpenMenu: () => void
  onOpenHandbook: (topic: HandbookTopicId) => void
  mapSlot: ReactNode
  countryFileSlot: ReactNode | null
  folderContentSlot: ReactNode
  bannerSlot?: ReactNode
}

export function DeskWorkspace({
  state,
  activeView,
  onSelectView,
  selectedFactionId,
  onSelectCountry,
  actions,
  onRemoveAction,
  onOpenCatalog,
  onEndTurn,
  ended,
  memos,
  onOpenMemo,
  onNavigateQuarterItem,
  onOpenMenu,
  onOpenHandbook,
  mapSlot,
  countryFileSlot,
  folderContentSlot,
  bannerSlot,
}: DeskWorkspaceProps) {
  const [hudExpanded, setHudExpanded] = useState(false)
  const [quarterExpanded, setQuarterExpanded] = useState(true)
  const [lowLamp, setLowLamp] = useState(false)
  const { connectYarn, clearYarn } = useDeskYarn()

  const target = state.house.boardTarget
  const progressPct = target.threshold > 0 ? (target.progressSnapshot / target.threshold) * 100 : 0
  const outlook = boardReviewOutlook(state)
  const boardWarning = outlook.isLastTurnBeforeReview
  const requiredPct = target.threshold > 0 ? (outlook.required / target.threshold) * 100 : 0
  const currentPct = target.threshold > 0 ? (outlook.current / target.threshold) * 100 : 0

  const quarterItems = deriveThisQuarter(state)
  const quarterNotices = deriveQuarterlyNotice(state)
  const quarterCount = quarterItems.length + (boardWarning ? 1 : 0)

  const flap = splitFlapDigits(state.house.treasury)
  const slotsCount = Math.max(state.house.actionPoints, actions.length)

  const headlines = [...state.wire].sort((a, b) => b.turn - a.turn).slice(0, 10)

  return (
    <div className={lowLamp ? 'desk-war-room is-low-lamp' : 'desk-war-room'} data-testid="desk-workspace">
      <div className="desk-lamp-vignette" aria-hidden="true" />

      <section className="desk-left-column">
        <header className="desk-top-bar ds-hud" data-testid="hud">
          <div className="desk-steel-cluster">
            <span className="desk-screw is-tl" aria-hidden="true" />
            <span className="desk-screw is-tr" aria-hidden="true" />
            <span className="desk-screw is-bl" aria-hidden="true" />
            <span className="desk-screw is-br" aria-hidden="true" />

            <button
              type="button"
              className="ds-hud-row desk-hud-main-btn"
              onClick={() => setHudExpanded((v) => !v)}
              aria-expanded={hudExpanded}
              aria-label="Show full status"
            >
              <span className="ds-hud-cell ds-hud-cell-doomsday">
                <DoomsdayGauge value={state.doomsday} />
                <span className={`ds-hud-value ${doomsdayTone(state.doomsday)}`} data-testid="hud-doomsday">
                  {state.doomsday.toFixed(0)}
                </span>
                <span className="ds-hud-label">Doomsday</span>
              </span>

              <span className="ds-hud-cell">
                <span className="desk-odo-housing" aria-hidden="true">
                  <span className="desk-odo-currency">{flap.sign}£</span>
                  {flap.digits.map((ch, idx) => (
                    <span key={idx} className="desk-odo-wheel">
                      {ch}
                    </span>
                  ))}
                  <span className="desk-odo-currency">{flap.suffix}</span>
                </span>
                <span
                  className={state.house.treasury < 0 ? 'ds-hud-value is-danger desk-sr-value' : 'ds-hud-value desk-sr-value'}
                  data-testid="hud-treasury"
                >
                  {formatMoney(state.house.treasury)}
                </span>
                <span className="ds-hud-label">Treasury</span>
              </span>

              <span className="ds-hud-cell ds-hud-cell-board">
                <span className="desk-board-lamp-row">
                  <span className={outlook.isLastTurnBeforeReview ? 'desk-lamp is-danger' : 'desk-lamp'} aria-hidden="true" />
                  <span className="ds-hud-bar">
                    <span className="ds-hud-bar-fill" style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
                  </span>
                </span>
                <span
                  className={outlook.isLastTurnBeforeReview ? 'ds-hud-label is-danger' : 'ds-hud-label'}
                  data-testid="hud-board-outlook"
                >
                  Bd {progressPct.toFixed(0)}% {outlook.turnsUntil !== null ? `· ${outlook.turnsUntil}t` : ''}
                </span>
              </span>

              <span className="ds-hud-cell ds-hud-cell-date">
                <span className="ds-hud-value" data-testid="datestamp">
                  {state.meta.year} · Q{state.meta.quarter}
                </span>
                <span className="ds-hud-label">Turn {state.meta.turn}</span>
              </span>
            </button>

            <button
              type="button"
              className="ds-hud-menu-button"
              onClick={onOpenMenu}
              aria-label="Menu"
              data-testid="hud-menu-button"
            >
              ☰
            </button>
          </div>

          <div className="desk-gadgets-cluster">
            <button
              type="button"
              className={state.pendingCrisis ? 'desk-gadget-btn is-ringing' : 'desk-gadget-btn'}
              onClick={() => onSelectView(state.pendingCrisis ? 'news' : 'contacts')}
              aria-label="Red Line Telephone"
              title="Direct Red Line — Opens Crisis or Dossiers"
            >
              <svg width="26" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6c2-2 14-2 16 0l1 3-4 1-1-2h-8l-1 2-4-1 1-3z" />
                <path d="M6 12h12l2 8H4l2-8z" />
                <circle cx="12" cy="16" r="2.2" />
              </svg>
              <span className="desk-dymo">{state.pendingCrisis ? 'CRISIS LINE' : 'RED LINE'}</span>
            </button>

            <button
              type="button"
              className="desk-gadget-btn is-lamp"
              onClick={() => setLowLamp((v) => !v)}
              aria-label="Toggle desk lamp brightness"
              title="Toggle Brass Desk Lamp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f2b441" strokeWidth="1.8">
                <path d="M6 9l6-5 6 5H6z" />
                <path d="M12 9v9M8 18h8" />
              </svg>
              <span className="desk-dymo">{lowLamp ? 'LAMP: LOW' : 'LAMP: HI'}</span>
            </button>
          </div>

          {hudExpanded && (
            <div className="ds-hud-expanded desk-hud-expanded-overlay" data-testid="hud-expanded">
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Doomsday
                  <InfoTooltip
                    text={hudSummary('doomsday')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('doomsday'))}
                    testId="hud-info-doomsday"
                  />
                </span>
                <span className="ds-hud-value">{state.doomsday.toFixed(0)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Treasury
                  <InfoTooltip
                    text={hudSummary('treasury')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('treasury'))}
                    testId="hud-info-treasury"
                  />
                </span>
                <span className="ds-hud-value">{formatMoney(state.house.treasury)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Board target
                  <InfoTooltip
                    text={hudSummary('board')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('board'))}
                    testId="hud-info-board"
                  />
                </span>
                <span className="ds-hud-value">{progressPct.toFixed(0)}%</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Debt
                  <InfoTooltip
                    text={hudSummary('debt')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('debt'))}
                    testId="hud-info-debt"
                  />
                </span>
                <span className="ds-hud-value">{formatMoney(state.house.debt)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Credit limit
                  <InfoTooltip
                    text={hudSummary('creditLimit')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('creditLimit'))}
                    testId="hud-info-credit-limit"
                  />
                </span>
                <span className="ds-hud-value" data-testid="credit-limit">
                  {formatMoney(state.house.creditLimit)}
                </span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Action points
                  <InfoTooltip
                    text={hudSummary('actionPoints')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('actionPoints'))}
                    testId="hud-info-action-points"
                  />
                </span>
                <span className="ds-hud-value">{state.house.actionPoints}</span>
              </span>
            </div>
          )}
        </header>

        <div className="desk-map-sheet">
          <span className="desk-masking-tape is-tl" aria-hidden="true" />
          <span className="desk-masking-tape is-tr" aria-hidden="true" />
          <span className="desk-brass-weight" aria-hidden="true" />
          <div className="desk-map-inner">{mapSlot}</div>
        </div>

        <div className="desk-bottom-left">
          <div className="desk-telex-box" data-testid="telex-ticker">
            <div className="desk-telex-header">
              <span className="desk-dymo">TELEX FEED · WIRE</span>
              <button type="button" className="desk-mini-link" onClick={() => onSelectView('news')}>
                OPEN WIRE DESK ▸
              </button>
            </div>
            <div className="desk-telex-roll">
              {headlines.length === 0 ? (
                <div className="desk-telex-line">Quiet on the line.</div>
              ) : (
                headlines.map((ev) => (
                  <div key={ev.id} className="desk-telex-line">
                    <strong>[T{String(ev.turn).padStart(2, '0')}]</strong> {ev.headline}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="desk-clipboard ds-quarterband">
            <div className="desk-clipboard-clip" aria-hidden="true" />
            <button
              type="button"
              className="ds-quarterband-head desk-clipboard-head"
              onClick={() => setQuarterExpanded((v) => !v)}
              aria-expanded={quarterExpanded}
              data-testid="quarterband-toggle"
            >
              <span className="ds-quarterband-icon" aria-hidden="true">
                ◆
              </span>
              <span className="ds-quarterband-label">This Quarter</span>
              <span className="ds-quarterband-count">{quarterCount}</span>
              {boardWarning && (
                <span className="ds-quarterband-warning" aria-hidden="true" data-testid="quarterband-board-warning">
                  ⚠
                </span>
              )}
              {memos.length > 0 && (
                <span
                  className="ds-quarterband-memos"
                  data-testid="quarterband-memo-count"
                  aria-label={`${memos.length} unread memo${memos.length === 1 ? '' : 's'}`}
                >
                  ✉ {memos.length}
                </span>
              )}
              <span className="ds-quarterband-spacer" />
              <span className="ds-quarterband-chevron" aria-hidden="true">
                {quarterExpanded ? '▴' : '▾'}
              </span>
            </button>

            {quarterExpanded && (
              <div className="ds-quarterband-body desk-clipboard-body" data-testid="quarterband-body">
                {quarterNotices.length > 0 && (
                  <div className="ds-quarterband-notice" data-testid="quarterband-notice">
                    {quarterNotices.map((n) => (
                      <p key={n.id} className="ds-quarterband-item" data-testid={`quarterband-notice-${n.id}`}>
                        <span aria-hidden="true">{n.icon}</span> {n.text}
                      </p>
                    ))}
                  </div>
                )}
                {memos.map((memo) => (
                  <button
                    key={memo.id}
                    type="button"
                    className="ds-quarterband-item-button is-memo"
                    onClick={() => onOpenMemo(memo.id)}
                    data-testid={`quarterband-memo-${memo.id}`}
                  >
                    <span className="ds-quarterband-item-icon" aria-hidden="true">
                      ✉
                    </span>
                    MEMO {memo.date} — {memo.subject}
                  </button>
                ))}
                {boardWarning && (
                  <p className="ds-quarterband-item is-warn" data-testid="quarterband-board-warning-item">
                    Board review next turn — at {currentPct.toFixed(0)}%, need {requiredPct.toFixed(0)}% to stay on track.
                  </p>
                )}
                {quarterItems.map((item) => {
                  const yarnTarget = yarnTargetForThisQuarter(item, state)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="ds-quarterband-item-button"
                      onMouseEnter={(e) => {
                        if (yarnTarget) connectYarn(e.currentTarget, yarnTarget, 'red')
                      }}
                      onMouseLeave={clearYarn}
                      onClick={() => onNavigateQuarterItem(item.target)}
                      data-testid={`quarterband-item-${item.id}`}
                    >
                      <span className="ds-quarterband-item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  )
                })}
                {quarterCount === 0 && quarterNotices.length === 0 && memos.length === 0 && (
                  <p className="ds-quarterband-item is-quiet">Nothing needs your attention.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="desk-right-column">
        <div className="desk-dossier-stack">
          <nav className="desk-manila-tabs ds-tabbar" data-testid="tabbar" aria-label="Dossier folders">
            {TABS.map((tab) => {
              const count = tab.view === 'contracts' ? state.market.openOrders.length : undefined
              const isActive = activeView === tab.view
              return (
                <button
                  key={tab.view}
                  type="button"
                  className={isActive ? 'desk-manila-tab ds-tabbar-item is-active' : 'desk-manila-tab ds-tabbar-item'}
                  onClick={() => {
                    if (tab.view !== 'operations') onSelectCountry(null)
                    onSelectView(tab.view)
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`tab-${tab.view}`}
                >
                  <span className="ds-tabbar-icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                  <span className="ds-tabbar-label">{tab.label}</span>
                  {count !== undefined && count > 0 && <span className="ds-tabbar-count">{count}</span>}
                </button>
              )
            })}
          </nav>

          <main className="desk-manila-body ds-shell-content">
            {bannerSlot}
            {activeView === 'operations' ? (
              countryFileSlot ? (
                countryFileSlot
              ) : (
                <TheatreOperationsBrief
                  state={state}
                  onSelectCountry={(fId) => onSelectCountry(fId)}
                  onSelectView={onSelectView}
                />
              )
            ) : (
              folderContentSlot
            )}
          </main>
        </div>

        <div className="desk-bottom-right ds-actiondock" data-testid="action-dock">
          <div className="desk-outbox-tray">
            <div className="desk-outbox-head">
              <span className="desk-dymo">DISPATCH OUTBOX · {state.house.actionPoints} EXECUTIVE SLOTS</span>
              <button type="button" className="desk-mini-link" onClick={onOpenCatalog}>
                ACTION CATALOG ▸
              </button>
            </div>
            <div className="ds-actiondock-slots desk-outbox-slots">
              {Array.from({ length: slotsCount }, (_, i) => {
                const action = actions[i]
                if (!action) {
                  return <ActionSlot key={i} empty onOpen={onOpenCatalog} testId={`action-slot-${i}-empty`} />
                }
                const { icon, label, cost } = actionSummary(state, action)
                const targetNode = yarnTargetForAction(action, state)
                return (
                  <div
                    key={i}
                    className="desk-slot-wrap"
                    onMouseEnter={(e) => {
                      if (targetNode) connectYarn(e.currentTarget, targetNode, 'amber')
                    }}
                    onMouseLeave={clearYarn}
                  >
                    <ActionSlot
                      icon={icon}
                      label={label}
                      cost={cost}
                      onRemove={() => onRemoveAction(i)}
                      testId={`action-slot-${i}`}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            className="desk-calendar-btn ds-button is-primary ds-actiondock-end"
            onClick={onEndTurn}
            disabled={ended}
            data-testid="end-quarter-button"
          >
            <span className="desk-cal-rings" aria-hidden="true">
              <span className="desk-cal-ring" />
              <span className="desk-cal-ring" />
            </span>
            <span className="desk-cal-sheet">
              <span className="desk-cal-turn">TURN {state.meta.turn}</span>
              <span className="desk-cal-quarter">
                Q{state.meta.quarter} {state.meta.year}
              </span>
            </span>
            <span className="desk-cal-cta">End Quarter</span>
          </button>
        </div>
      </section>
    </div>
  )
}
=== END FILE ===

=== BEGIN FILE: packages/app/src/styles/desk-war-room.css ===
/* desk-war-room.css — Paket G1 & G2 (ETAPP 12): Diegetiskt PC-skrivbord (1965) */

.desk-war-room {
  position: relative;
  width: 100vw;
  height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(ellipse 88% 78% at 38% 46%, rgba(255, 232, 185, 0.12) 0%, rgba(18, 11, 6, 0.65) 75%, rgba(6, 4, 2, 0.94) 100%),
    repeating-linear-gradient(92deg, rgba(255, 255, 255, 0.012) 0px, rgba(255, 255, 255, 0.012) 2px, rgba(0, 0, 0, 0.08) 2px, rgba(0, 0, 0, 0.08) 7px),
    linear-gradient(160deg, #3a2518 0%, #24160d 55%, #140c07 100%);
  display: grid;
  grid-template-columns: minmax(620px, 1.22fr) minmax(480px, 0.98fr);
  grid-template-rows: 1fr;
  gap: 20px;
  padding: 14px 20px;
  box-sizing: border-box;
}

.desk-war-room.is-low-lamp {
  filter: contrast(1.06) brightness(0.92);
}

.desk-lamp-vignette {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle 660px at 34% 46%, rgba(255, 236, 179, 0.14) 0%, rgba(20, 12, 5, 0.16) 58%, rgba(6, 4, 2, 0.58) 100%);
  z-index: 45;
}

.desk-war-room.is-low-lamp .desk-lamp-vignette {
  background: radial-gradient(circle 520px at 34% 46%, rgba(255, 218, 125, 0.25) 0%, rgba(10, 6, 2, 0.58) 58%, rgba(4, 2, 1, 0.86) 100%);
}

.desk-yarn-overlay {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100dvh;
  pointer-events: none;
  z-index: 60;
}

.desk-yarn-line {
  fill: none;
  stroke: var(--red, #b3302a);
  stroke-width: 2.6;
  stroke-dasharray: 7 4;
  stroke-linecap: round;
}

.desk-yarn-group.is-amber .desk-yarn-line {
  stroke: var(--amber, #b0700f);
}

.desk-yarn-pin-start {
  fill: var(--amber, #b0700f);
  stroke: var(--ink, #241f18);
  stroke-width: 1.5;
}

.desk-yarn-target-halo {
  fill: rgba(179, 48, 42, 0.18);
  stroke: var(--red, #b3302a);
  stroke-width: 2.2;
}

.desk-yarn-pin-end {
  fill: var(--red, #b3302a);
}

.desk-left-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  position: relative;
}

.desk-top-bar {
  display: flex;
  align-items: stretch;
  gap: 10px;
  height: 76px;
  flex-shrink: 0;
  position: relative;
  z-index: 30;
  background: transparent;
  border: none;
  padding: 0;
}

.desk-steel-cluster {
  flex: 1;
  background: linear-gradient(180deg, #434b40 0%, #2e342c 48%, #1d221b 100%);
  border: 2px solid #0e110d;
  border-radius: 4px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.16);
  display: flex;
  align-items: center;
  padding: 0 12px;
  position: relative;
}

.desk-screw {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #9ca390, #2a2f27);
  box-shadow: 0 1px 1px #000;
}
.desk-screw.is-tl { left: 5px; top: 5px; }
.desk-screw.is-tr { right: 5px; top: 5px; }
.desk-screw.is-bl { left: 5px; bottom: 5px; }
.desk-screw.is-br { right: 5px; bottom: 5px; }

.desk-hud-main-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--steel-ink, #d9d1b6);
}

.desk-odo-housing {
  display: inline-flex;
  align-items: center;
  padding: 2px 3px;
  background: #080908;
  border: 1px solid #000;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.12);
  border-radius: 2px;
}

.desk-odo-currency {
  color: #c9c1a8;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  padding: 0 3px;
}

.desk-odo-wheel {
  display: inline-flex;
  width: 13px;
  height: 21px;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #0b0b0a 0%, #2b2a26 48%, #121210 52%, #0b0b0a 100%);
  color: #f3ecd8;
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  border-right: 1px solid #000;
}

.desk-sr-value {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.desk-board-lamp-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.desk-lamp {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff2c4, #f2b441 55%, #a4650a);
  box-shadow: 0 0 6px rgba(242, 180, 65, 0.75);
}

.desk-lamp.is-danger {
  background: radial-gradient(circle at 35% 35%, #ffd2cc, #b3302a 55%, #61120e);
  box-shadow: 0 0 8px rgba(179, 48, 42, 0.9);
}

.desk-gadgets-cluster {
  display: flex;
  gap: 8px;
}

.desk-gadget-btn {
  width: 92px;
  background: radial-gradient(ellipse at 50% 25%, #2f2c28, #12100e 75%);
  border: 2px solid #080706;
  border-radius: 4px;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.12);
  color: #e8dfc8;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 6px;
}

.desk-gadget-btn.is-lamp {
  width: 74px;
}

.desk-gadget-btn.is-ringing {
  border-color: var(--amber-glow, #f2b441);
  animation: deskPhoneRing 0.35s ease-in-out infinite;
}

@keyframes deskPhoneRing {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-3deg); }
  75% { transform: rotate(3deg); }
}

.desk-dymo {
  display: inline-block;
  background: #121211;
  color: #f4f2eb;
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 1px 5px;
  border-radius: 2px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 1px 2px rgba(0, 0, 0, 0.65);
  text-transform: uppercase;
  white-space: nowrap;
}

.desk-hud-expanded-overlay {
  position: absolute;
  top: 78px;
  left: 0;
  right: 0;
  z-index: 40;
  background: #22271f;
  border: 2px solid #11140e;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.75);
}

.desk-map-sheet {
  position: relative;
  flex: 1;
  min-height: 0;
  background: #d8ccb0;
  padding: 7px;
  border-radius: 2px;
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.75), inset 0 0 0 1px #b5a47e;
  display: flex;
}

.desk-masking-tape {
  position: absolute;
  width: 54px;
  height: 18px;
  background: rgba(232, 217, 172, 0.8);
  border: 1px solid rgba(168, 148, 100, 0.55);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
  z-index: 25;
  pointer-events: none;
}
.desk-masking-tape.is-tl { top: -5px; left: 16px; transform: rotate(-16deg); }
.desk-masking-tape.is-tr { top: -5px; right: 20px; transform: rotate(14deg); }

.desk-brass-weight {
  position: absolute;
  bottom: 12px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 32%, #fbe5a2, #c79531 55%, #6e4e0e 100%);
  border: 1px solid #4a3306;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6), inset 0 1px 2px rgba(255, 255, 255, 0.6);
  z-index: 25;
  pointer-events: none;
}

.desk-map-inner {
  position: relative;
  flex: 1;
  display: flex;
  border: 1.5px solid #5d4b35;
  overflow: hidden;
}

.desk-bottom-left {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 12px;
  height: 126px;
  flex-shrink: 0;
  z-index: 25;
}

.desk-telex-box {
  background: #222520;
  border: 2px solid #0e100d;
  border-radius: 4px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.65);
  padding: 6px 9px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
}

.desk-telex-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.desk-mini-link {
  background: transparent;
  border: none;
  color: #f2b441;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.desk-telex-roll {
  flex: 1;
  background: #efe3b8;
  border: 1px solid #8f7f5e;
  box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.25);
  padding: 5px 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.38;
  color: #262016;
  overflow-y: auto;
}

.desk-telex-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desk-clipboard {
  background: #6e4b2a;
  border: 2px solid #382310;
  border-radius: 4px;
  padding: 6px 7px 5px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.65);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.desk-clipboard-clip {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 11px;
  background: linear-gradient(180deg, #d8c38a, #8c7335);
  border: 1px solid #3a2e10;
  border-radius: 2px;
}

.desk-clipboard-head {
  background: #f7f2e4;
  border: 1px solid #c4b491;
  padding: 3px 8px;
  min-height: 28px;
}

.desk-clipboard-body {
  flex: 1;
  background: #f7f2e4;
  border: 1px solid #c4b491;
  border-top: none;
  overflow-y: auto;
  max-height: none;
  padding: 4px 6px;
}

.desk-right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  position: relative;
}

.desk-dossier-stack {
  position: relative;
  flex: 1;
  min-height: 0;
  padding-top: 30px;
  display: flex;
  flex-direction: column;
}

.desk-manila-tabs {
  position: absolute;
  top: 2px;
  left: 10px;
  right: 10px;
  height: 29px;
  display: flex;
  flex-direction: row;
  gap: 4px;
  background: transparent;
  border: none;
  padding: 0;
  z-index: 12;
}

.desk-manila-tab {
  flex: 1;
  height: 28px;
  min-height: 28px;
  padding: 4px 8px 0;
  background: #ccb47a;
  border: 1px solid #b89b58;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-dim);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 5px;
  cursor: pointer;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.2);
}

.desk-manila-tab.is-active {
  background: #e4cf98;
  color: var(--ink);
  height: 30px;
  transform: translateY(-1px);
}

.desk-manila-body {
  position: relative;
  flex: 1;
  min-height: 0;
  background: linear-gradient(180deg, #e4cf98 0%, #d6bc7e 100%);
  border: 1.5px solid #b89b58;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  padding: 14px 16px;
  overflow-y: auto;
}

.desk-manila-body .ds-sheet-overlay {
  position: static;
  background: transparent;
  padding: 0;
}

.desk-manila-body .ds-sheet {
  position: static;
  max-height: none;
  width: 100%;
  box-shadow: none;
  border: none;
  background: transparent;
}

.desk-ops-brief {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.desk-folder-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1.5px solid var(--ink);
  padding-bottom: 6px;
}

.desk-kicker {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-dim);
  letter-spacing: 0.06em;
}

.desk-folder-title {
  font-family: var(--font-display);
  font-size: 20px;
  margin: 2px 0 0;
}

.desk-section-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--ink-dim);
  letter-spacing: 0.06em;
  border-bottom: 1px dashed #b89b58;
  padding-bottom: 2px;
}

.desk-card-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.desk-index-card {
  background: var(--panel, #f6f1e3);
  border: 1px solid #c5b48a;
  border-top: 3px solid var(--ink);
  padding: 9px 11px;
  box-shadow: 0 2px 6px rgba(45, 30, 10, 0.2);
}

.desk-index-card.is-interactive {
  cursor: pointer;
}

.desk-index-card.is-interactive:hover {
  background: #fbf7ec;
  border-top-color: var(--amber);
}

.desk-card-top,
.desk-card-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.desk-card-sub {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-dim);
  margin-top: 3px;
}

.desk-mono-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
}

.desk-mono-val {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  color: var(--amber-ink);
}

.desk-buyer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.desk-buyer-card {
  background: var(--panel, #f6f1e3);
  border: 1px solid #c5b48a;
  border-top: 3px solid var(--amber);
  padding: 8px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 5px rgba(45, 30, 10, 0.2);
}

.desk-rubber-stamp {
  display: inline-block;
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.12em;
  padding: 1px 6px;
  border: 1.8px solid currentColor;
  transform: rotate(-4deg);
}
.desk-rubber-stamp.is-red { color: var(--red); }
.desk-rubber-stamp.is-green { color: var(--green); }
.desk-rubber-stamp.is-amber { color: var(--amber-ink); }

.desk-bottom-right {
  display: flex;
  align-items: stretch;
  gap: 12px;
  height: 126px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: 0;
}

.desk-outbox-tray {
  flex: 1;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.03) 0 2px, transparent 2px 8px),
    linear-gradient(180deg, #2a241e, #1a1612);
  border: 2px solid #4a4238;
  border-radius: 4px;
  box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.8), 0 8px 20px rgba(0, 0, 0, 0.65);
  padding: 7px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.desk-outbox-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.desk-outbox-slots {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  flex: 1;
  align-items: stretch;
  margin-top: 5px;
}

.desk-slot-wrap {
  display: flex;
}

.desk-slot-wrap > * {
  flex: 1;
}

.desk-calendar-btn {
  width: 158px;
  height: auto;
  background: linear-gradient(180deg, #332920 0%, #1c1611 100%);
  border: 2px solid #0d0a07;
  border-radius: 5px;
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.14);
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.desk-cal-rings {
  display: flex;
  gap: 26px;
  margin-top: -11px;
}

.desk-cal-ring {
  width: 7px;
  height: 12px;
  background: linear-gradient(90deg, #8c7335, #fbe5a2, #6e4e0e);
  border-radius: 2px;
}

.desk-cal-sheet {
  width: 100%;
  background: #f5eed9;
  border: 1px solid #b5a47e;
  border-bottom: 3px solid #bfb08e;
  padding: 4px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ink);
}

.desk-cal-turn {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--red);
}

.desk-cal-quarter {
  font-family: var(--font-display);
  font-size: 18px;
  line-height: 1.05;
}

.desk-cal-cta {
  font-family: var(--font-display);
  font-size: 14px;
  letter-spacing: 0.06em;
  color: #f6ead4;
}
=== END FILE ===