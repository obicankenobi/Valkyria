// standingOrderBoard.ts — P101 (ETAPP8_FORSLAG.md §5.2). Rena hjälpare åt anslagstavlan: nyckeln som
// gör att en ny ändring ersätter en tidigare köad för samma föremål, och larmen (rött fettkritsstreck +
// en rad i This Quarter) härledda ur state — aldrig lagrade. Ren, testbar.
import { DISPLAY_THRESHOLDS, standingStationMode } from '@seventh-front/core'
import type { GameState, StandingOrderChange } from '@seventh-front/core'

// En ny ändring för samma linje / station / råvara ersätter en tidigare köad (SET och CANCEL för samma
// råvara delar nyckel — den senare vinner).
export function standingOrderKey(change: StandingOrderChange): string {
  switch (change.kind) {
    case 'LINE':
      return `line:${change.lineId}`
    case 'SUPPLY':
      return `supply:${change.commodity}`
    case 'STATION':
      return `station:${change.stationId}`
  }
}

export type StandingAlarmKind = 'line' | 'supply' | 'station'

export interface StandingAlarm {
  // Kortets id på tavlan (samma id som data-testid="standing-card-<id>" och This Quarter-radens fokus).
  cardId: string
  kind: StandingAlarmKind
  text: string
}

const VOIDED_LINE = /^(LINE-\d+) WAS BUILDING FOR A VOIDED CONTRACT/

// De tre larmen från P100, ur state. Avtals- och stationslarmet läses ur fälten själva (samma tal
// core larmar vid); linjelarmet är en engångshändelse i wire (ingen linje "är" i larmläge efteråt —
// den frigjordes redan), så det läses ur SENASTE turens rubriker och kräver att linjen HAR en order.
export function standingOrderAlarms(state: GameState): StandingAlarm[] {
  const alarms: StandingAlarm[] = []
  const orders = state.house.standingOrders
  if (!orders) return alarms
  const lastTurn = state.meta.turn - 1

  for (const event of state.wire) {
    if (event.turn !== lastTurn) continue
    const match = VOIDED_LINE.exec(event.headline)
    if (!match) continue
    const lineId = match[1]!.toLowerCase()
    if (!orders.lines[lineId]) continue
    alarms.push({ cardId: lineId, kind: 'line', text: 'Was building for a voided contract' })
  }

  for (const agreement of orders.supply) {
    if (agreement.lossStreak < DISPLAY_THRESHOLDS.supplyLossStreakTurns) continue
    alarms.push({
      cardId: `supply-${agreement.commodity}`,
      kind: 'supply',
      text: `Losing money ${agreement.lossStreak} quarters running`,
    })
  }

  for (const station of state.house.stations) {
    if (station.status !== 'active') continue
    if (standingStationMode(state.house, station.id, state.meta.turn) !== 'active') continue
    if (station.exposure <= DISPLAY_THRESHOLDS.exposureBurnThreshold) continue
    alarms.push({ cardId: station.id, kind: 'station', text: 'On active duty past the burn threshold' })
  }

  return alarms
}
