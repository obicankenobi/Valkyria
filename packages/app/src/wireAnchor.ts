// wireAnchor — vart en WireEvent hör hemma i gränssnittet (ETAPP7_TEKNISK_SPEC.md
// §8, signaturen ordagrant: `wireAnchor(state, event): { kind, id }`). Ren,
// testbar — läser bara `state`, härleder aldrig av `scope` ensam.
//
// SCOPE-BESLUT, dokumenterat (specen ger bara signaturen, ingen routningsregel):
// `event.scope` räcker INTE ensamt för att avgöra `kind` — genuint fynd under
// research: `adjustFrontOpponentRelations` (political.ts) emittar `scope:
// 'faction'` med `subjectId: front.id` (en FRONT, inte en faktion), eftersom
// händelsen rör relationen MELLAN två länder, som bara existerar via deras
// gemensamma front. Regeln är därför DATA-driven, i den här ordningen:
//   1. subjectId === null → 'hud' (husövergripande händelser: ekonomi,
//      produktion, R&D, doomsday, styrelsegranskning — ingen egen plats).
//   2. subjectId är ett FrontId (finns i state.fronts) → 'sector', id =
//      subjectId. Fångar ALLA scope:'front'-händelser plus de enstaka
//      scope:'faction'-händelser som i själva verket rör en front (ovan).
//   3. subjectId är ett FactionId (finns i state.factions):
//      a. scope === 'house' OCH huset har en station (aktiv, vilande eller
//         bränd — alla tre kan vara ämnet, t.ex. en nyss BRÄND station) i det
//         landet → 'station', id = den stationens `id`. Täcker EXPAND/
//         WITHDRAW/RECRUIT/SABOTAGE-fynd/stationsexponering (upkeep.ts,
//         applyActions.ts) — alla emitterar `scope: 'house'` med
//         `subjectId: station.nation`, aldrig stationens EGET id (WireEvent
//         har inget sådant fält — en redan existerande, inte här införd,
//         granularitetsgräns: flera stationer i samma land går inte att
//         skilja åt på wire-nivå, den FÖRSTA i `house.stations` väljs).
//      b. annars → 'country', id = subjectId. Täcker scope:'faction' (rykte,
//         counterIntelligence, alignment, relationToPlayer) och scope:
//         'market' (kontrakt, leveranser, bud — `contract.buyerId` är alltid
//         en FactionId) samt scope:'house'-händelser mot ett land UTAN egen
//         station (t.ex. en köpares egen leverans-notis).
//   4. subjectId är ett TheatreId (finns i state.theatres, kollat EFTER
//      fronter/faktioner) → 'sector', id = subjectId. GENUINT FYND, hittat
//      vid mätningen mot ett riktigt 20-turersparti, inte i förväg gissat:
//      `heat.ts`/`doomsday.ts`s HEAT-händelser (`"INDOCHINA HEAT: 25 →
//      13"`, `"INDOCHINA ESCALATES"`) har `subjectId: theatre.id` — en
//      TREDJE id-rymd, skild från `state.fronts`. En teater är kartans
//      bredaste geografiska enhet (innehåller flera fronter) och hör hemma
//      på samma plats som en front — `kind: 'sector'` (§8 ger ingen egen
//      'theatre'-variant). ORDNINGEN SPELAR ROLL: `indochina-slice.json`s
//      andra teater heter `laos` — SAMMA sträng som faktionen `laos`
//      (`front-laos` däremot krockar aldrig, prefixet skiljer). Kollas
//      teatern FÖRE faktionen hade Laos-landets egna, betydligt vanligare
//      köpar-/underrättelsehändelser (`country`) tystats till `sector` —
//      dokumenterad, avsiktlig prioritering: en enskild teaterhändelse
//      (en sällsynt HEAT-ticker) väger mindre än att Laos LANDETS alla
//      övriga händelser pekar rätt. Konsekvensen: Laos-TEATERNS egna
//      HEAT-händelser klassas som `country`/`laos` i stället för `sector`
//      — fel finkornighet, men fortfarande INTE `hud`, så täckningsmåttet
//      (§8:s klart-när) påverkas inte. En riktig fix kräver ett eget
//      `theatreId`-fält på `WireEvent`, en schemaändring utanför P80:s
//      mandat — inte löst här, se docs/ANDRINGSLOGG.md.
//   5. Annat subjectId (t.ex. ett RivalId — `rivals.ts`s `scope: 'market',
//      subjectId: rival.id`) → 'hud'. KÄND, DOKUMENTERAD LUCKA: kind-unionen
//      (§8) har ingen 'company'/'rival'-variant, så en rivals egna affärer
//      (byggd R&D, fullföljda kontrakt) hamnar på HUD tills en framtida
//      prompt (P86:s CONTACTS-dossierer för rivalhus) ger dem en egen plats
//      att peka på. Inte löst här — se docs/ANDRINGSLOGG.md.
import type { GameState, WireEvent } from '@seventh-front/core'

export type WireAnchorKind = 'sector' | 'country' | 'station' | 'hud'

export interface WireAnchor {
  kind: WireAnchorKind
  id: string
}

const HUD: WireAnchor = { kind: 'hud', id: 'hud' }

export function wireAnchor(state: GameState, event: WireEvent): WireAnchor {
  const subjectId = event.subjectId
  if (subjectId === null) return HUD

  if (subjectId in state.fronts) {
    return { kind: 'sector', id: subjectId }
  }

  if (subjectId in state.factions) {
    if (event.scope === 'house') {
      const station = state.house.stations.find((s) => s.nation === subjectId)
      if (station) return { kind: 'station', id: station.id }
    }
    return { kind: 'country', id: subjectId }
  }

  if (subjectId in state.theatres) {
    return { kind: 'sector', id: subjectId }
  }

  return HUD
}

// anchorLabel — en kort, läsbar etikett för en WireAnchor, för QuarterReplay
// (P80) och NEWS DESK:s förstasida. `null` för 'hud' (ingen plats att peka
// på, ingen badge att visa). 'sector' läser via fronten till dess TEATERS
// namn i stället för frontens eget id (Front saknar ett `name`-fält, bara
// `id`/`theatreId`) — om id:t redan ÄR ett teater-id (2b i wireAnchor.ts:s
// egen kommentar) slås det upp direkt.
export function anchorLabel(state: GameState, anchor: WireAnchor): string | null {
  switch (anchor.kind) {
    case 'hud':
      return null
    case 'country':
      return state.factions[anchor.id]?.name.toUpperCase() ?? anchor.id.toUpperCase()
    case 'station': {
      const station = state.house.stations.find((s) => s.id === anchor.id)
      return station ? station.city.toUpperCase() : anchor.id.toUpperCase()
    }
    case 'sector': {
      const front = state.fronts[anchor.id]
      const theatre = front ? state.theatres[front.theatreId] : state.theatres[anchor.id]
      return theatre ? theatre.name.toUpperCase() : anchor.id.toUpperCase()
    }
  }
}
