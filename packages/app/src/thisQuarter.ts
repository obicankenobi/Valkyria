// thisQuarter.ts — P83 (ETAPP7_TEKNISK_SPEC.md §7.7, §13). "Ett alltid synligt
// band under HUD:en med antal lägen... Listan är en vägvisare, inte ett
// formulär: den löser att verb gömda i bottenark annars är svåra att hitta
// och omöjliga att planera kring. Härleds med en ren funktion i appen ur
// GameState." — ren, testbar, rör aldrig packages/core (§7.7 säger
// uttryckligen "i appen", till skillnad från t.ex. wireAnchor.ts som ändå
// bara läser strukturerade WireEvent-fält).
//
// De sex radtyperna, ordagrant ur §7.7: nya ordrar, stationer med hög
// exponering, tjänstemän inför omval eller ersättning, kontrakt som riskerar
// att bli sena, kreditgränsen nära, pågående kris.
import type { FactionId, GameState } from '@seventh-front/core'
import { DISPLAY_THRESHOLDS, getProduct } from '@seventh-front/core'
import { standingOrderAlarms } from './standingOrderBoard.js'

export type ThisQuarterKind = 'order' | 'station' | 'official' | 'contract' | 'credit' | 'crisis' | 'standing'

export type ThisQuarterTarget =
  | { view: 'contracts' }
  | { view: 'operations'; factionId: FactionId }
  | { view: 'contacts' }
  // focus (P101): id på ett kort på anslagstavlan som ska öppnas och rullas fram när vyn visas.
  | { view: 'company'; focus?: string }
  | { view: 'news' }

export interface ThisQuarterItem {
  id: string
  kind: ThisQuarterKind
  icon: string
  label: string
  target: ThisQuarterTarget
}

// PROVISORISKA tröskelvärden — §7.7 ger ingen exakt siffra för någon av de
// tre (bara "hög exponering", som ÄR balansdata, se nedan). Reglerna nedan
// är appens EGNA, dokumenterade gissningar, kalibrerbara utan att röra
// core (samma anda som mapLegend.ts:s egna, odelade konstanter).
const LOW_STANDING_THRESHOLD = 30 // Official.standing under detta: posten vacklar.
const LATE_RISK_TURNS_REMAINING = 1 // dueTurn inom så här många turer: risk att bli sen.
const CREDIT_NEAR_LIMIT_PCT = 90 // andel av creditLimit förbrukad: nära gränsen.

export function deriveThisQuarter(state: GameState): ThisQuarterItem[] {
  const items: ThisQuarterItem[] = []

  for (const order of state.market.openOrders) {
    const buyer = state.factions[order.buyerId]
    const product = getProduct(order.productId)
    items.push({
      id: `order-${order.id}`,
      kind: 'order',
      icon: '§',
      label: `New order: ${product.name} for ${buyer?.name ?? order.buyerId}`,
      target: { view: 'contracts' },
    })
  }

  // "stationer med hög exponering" — DISPLAY_THRESHOLDS.exposureBurnThreshold
  // ÄR balansdata (P29, återanvänd av P82:s pulserande ring på kartan också)
  // — samma tal, en tredje läsare.
  for (const station of state.house.stations) {
    if (station.status !== 'active') continue
    if (station.exposure < DISPLAY_THRESHOLDS.exposureBurnThreshold) continue
    items.push({
      id: `station-${station.id}`,
      kind: 'station',
      icon: '⚠',
      label: `${station.city} station is highly exposed`,
      target: { view: 'operations', factionId: station.nation },
    })
  }

  for (const official of Object.values(state.officials)) {
    if (official.status !== 'active') continue
    if (official.standing >= LOW_STANDING_THRESHOLD) continue
    items.push({
      id: `official-${official.id}`,
      kind: 'official',
      icon: '☒',
      label: `${official.name} (${official.post}) may lose their post`,
      target: { view: 'contacts' },
    })
  }

  for (const contract of state.market.contracts) {
    if (contract.status !== 'active') continue
    if (contract.dueTurn - state.meta.turn > LATE_RISK_TURNS_REMAINING) continue
    const buyer = state.factions[contract.buyerId]
    items.push({
      id: `contract-${contract.id}`,
      kind: 'contract',
      icon: '⏱',
      label: `Contract with ${buyer?.name ?? contract.buyerId} is due soon`,
      target: { view: 'contracts' },
    })
  }

  if (state.house.creditLimit > 0 && state.house.debt / state.house.creditLimit >= CREDIT_NEAR_LIMIT_PCT / 100) {
    items.push({
      id: 'credit',
      kind: 'credit',
      icon: '£',
      label: 'The credit limit is nearly reached',
      target: { view: 'company' },
    })
  }

  // P101 (ETAPP8_FORSLAG.md §5.2): ett stående-order-larm ger en rad som hoppar till kortet på tavlan.
  for (const alarm of standingOrderAlarms(state)) {
    items.push({
      id: `standing-${alarm.cardId}`,
      kind: 'standing',
      icon: '⚠',
      label: `Standing order ${alarm.cardId.replace(/^supply-/, '')}: ${alarm.text.toLowerCase()}`,
      target: { view: 'company', focus: alarm.cardId },
    })
  }

  if (state.pendingCrisis) {
    items.push({
      id: 'crisis',
      kind: 'crisis',
      icon: '☢',
      label: 'A crisis awaits a decision',
      target: { view: 'news' },
    })
  }

  return items
}

// P81-11 (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten): "Kvartalsbeskedet
// ligger överst i listan efter kvartalsuppspelningen: vunna och förlorade
// bud (med vinnare och pris när underrättelsen räcker), levererade kontrakt
// och inbetalningar." Läser scope:'market'-händelser (samma strukturerade
// markering newsClassification.ts:s egen kommentar redan etablerade som
// "en redan strukturerad, konsekvent markering för just handelshändelser")
// från den SENASTE turen i state.wire — inte hela det rullande fönstret.
//
// AVSTEG, dokumenterat: "vinnare och pris när underrättelsen räcker"
// antyder att förlorade buds vinnare/pris ska döljas utan tillräcklig
// underrättelse (effectiveDepth) — men WireEvent.headline är redan
// FÄRDIGSKRIVEN text utan någon dimningsmekanism NÅGONSTANS i kodbasen
// (formationDisplay/officialDisplay dimmar STRUKTURERADE fält, aldrig en
// rubriks fritext). Att införa textredigering här hade varit en ny, unik
// mekanism utan motstycke i resten av appen — headlinen visas därför
// oavkortad, som varje annan skärm redan gör.
export interface QuarterlyNoticeItem {
  id: string
  icon: string
  text: string
}

export function deriveQuarterlyNotice(state: GameState): QuarterlyNoticeItem[] {
  if (state.wire.length === 0) return []
  const latestTurn = Math.max(...state.wire.map((e) => e.turn))

  const items: QuarterlyNoticeItem[] = []
  for (const event of state.wire) {
    if (event.turn !== latestTurn || event.scope !== 'market') continue
    if (event.actorIsPlayer && /WINS CONTRACT/.test(event.headline)) {
      items.push({ id: event.id, icon: '✓', text: event.headline })
    } else if (!event.actorIsPlayer && /WINS CONTRACT/.test(event.headline)) {
      items.push({ id: event.id, icon: '✗', text: event.headline })
    } else if (/^DELIVERED /.test(event.headline)) {
      items.push({ id: event.id, icon: '£', text: event.headline })
    } else if (/^CONTRACT .+ FULFILLED:/.test(event.headline)) {
      items.push({ id: event.id, icon: '✓', text: event.headline })
    }
  }
  return items
}
