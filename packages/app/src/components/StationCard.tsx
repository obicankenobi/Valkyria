// StationCard — P163 (ETAPP10_FORSLAG.md §3b, S5): "stationskortet säger vad en station är och listar vad just den ger — prisbandets bredd, köparens villkor, förbandens
// styrka, upplåsta verb — och vad nästa djupnivå skulle ge." Allt läses ur stationOutlook.ts (kärnans egna frågor), ingenting hittas på här.
import { useState } from 'react'
import type { FactionId, GameState } from '@seventh-front/core'
import { COVERAGE_EFFECT, WHAT_A_STATION_IS, stationOutlook } from '../stationOutlook.js'
import { formatMoney } from './ui.js'

export function StationCard({ state, factionId }: { state: GameState; factionId: FactionId }) {
  const o = stationOutlook(state, factionId)
  const [open, setOpen] = useState(false) // regel 7: två rader brödtext, resten bakom en knapp
  const station = state.house.stations.find((s) => s.nation === factionId && s.status === 'active')
  const here = station
    ? `${station.city}, depth ${o.stationDepth}${o.salesmanBonus ? ' (+1 from your chief salesman)' : ''}`
    : o.salesmanBonus
      ? 'No station. Your chief salesman still gives you depth 1 here.'
      : o.dormant
        ? `Your ${o.dormant.city} station is dormant (depth ${o.dormant.depth}) — it gives no insight until you REOPEN it.`
        : 'No station — you see the least here.'

  return (
    <div className="action-card station-card" data-testid="station-card">
      <p className="action-card-does" data-testid="station-card-what">
        {WHAT_A_STATION_IS}
      </p>
      <p className="station-card-summary" data-testid="station-card-summary">
        {station ? `${station.city}, depth ${o.stationDepth}` : o.dormant ? `${o.dormant.city} station dormant` : 'No station here'} · price bands {o.bandPct === 0 ? 'exact' : `±${o.bandPct}%`}
      </p>
      <button type="button" className="action-card-more" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="station-card-toggle">
        {open ? 'Hide details ▴' : 'What does this station give? ▾'}
      </button>
      {open && (
      <dl className="action-card-rows">
        <div className="action-card-row">
          <dt>Here</dt>
          <dd data-testid="station-card-here">{here}</dd>
        </div>
        <div className="action-card-row">
          <dt>Price bands</dt>
          <dd data-testid="station-card-bands">{o.bandPct === 0 ? 'Exact' : `±${o.bandPct}% around the lowest rival bid`}</dd>
        </div>
        <div className="action-card-row">
          <dt>Buyer terms</dt>
          <dd data-testid="station-card-terms">{o.buyerTermsVisible ? 'Credit and drivers shown on orders' : 'Hidden (shown as ?)'}</dd>
        </div>
        <div className="action-card-row">
          <dt>Formations</dt>
          <dd data-testid="station-card-formations">
            {o.formationCount === 0 ? 'None here' : o.formationsKnown ? `${o.formationCount} here, exact strength shown` : `${o.formationCount} here, strength unknown`}
          </dd>
        </div>
        <div className="action-card-row">
          <dt>Covers</dt>
          <dd data-testid="station-card-coverage">
            {o.coverage.length > 0 ? o.coverage.map((c) => `${c}: ${COVERAGE_EFFECT[c]}`).join('; ') : 'Nothing — no active station here'}
          </dd>
        </div>
        <div className="action-card-row">
          <dt>Unlocks</dt>
          <dd data-testid="station-card-verbs">{o.verbs.length > 0 ? o.verbs.join(', ') : o.dormant ? 'Nothing — REOPEN wakes the dormant station' : 'Nothing — RECRUIT opens a station here'}</dd>
        </div>
        <div className="action-card-row">
          <dt>Next level</dt>
          <dd data-testid="station-card-next">
            {o.next === null
              ? 'This is the deepest level you can reach.'
              : o.next.how === 'RECRUIT' || o.next.how === 'REOPEN'
                ? `${o.next.how} (${o.next.cost === null ? 'free' : formatMoney(o.next.cost)}): ${o.next.gains.join('; ')}.`
                : `EXPAND to depth ${o.next.depth} (${o.next.cost === null ? 'free' : formatMoney(o.next.cost)}): ${o.next.gains.join('; ')}.`}
          </dd>
        </div>
      </dl>
      )}
    </div>
  )
}
