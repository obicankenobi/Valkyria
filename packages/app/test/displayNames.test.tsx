// Etapp 14, P202 (förslaget "Krigsrumsbordet" §7.3, skyddsräcke 5): inga interna ID:n i spelarens vy. Spelar några kvartal med
// en bot, renderar NEWS DESK (förstasida och arkiv), CONTRACTS och CONTACTS på riktigt och fäller varje ID ur state, varje
// enum-/fältnamn och de gamla utvecklarsträngarna om de syns i texten.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { GameState, Order, TurnSubmission } from '@seventh-front/core'
import { TheWire } from '../src/components/TheWire.js'
import { TheFloor } from '../src/components/TheFloor.js'
import { ThePolitics } from '../src/components/ThePolitics.js'
import { agendaLabel, deltaLabel, frontName, orderCause, orderPlace } from '../src/displayNames.js'

afterEach(cleanup)

// Reducerad rörelse: telexets radvisning (useRevealedCount) visar allt direkt.
function mockMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

function played(turns: number): GameState {
  let state = createInitialState('indochina-slice', 'raw-ids-seed')
  for (let t = 0; t < turns; t++) state = resolveTurn(state, EMPTY).state
  return state
}

// Allt som är ett internt ID eller fältnamn och aldrig får stå i texten.
function forbidden(state: GameState): string[] {
  const ids = new Set<string>()
  for (const id of Object.keys(state.fronts)) ids.add(id)
  for (const front of Object.values(state.fronts)) for (const f of front.formations) ids.add(f.id)
  for (const id of Object.keys(state.officials)) ids.add(id)
  for (const c of state.market.contracts) ids.add(c.id)
  for (const o of state.market.openOrders) ids.add(o.id)
  return [...ids, 'PolicyDecision', 'SELF_ENRICHMENT', 'NON_ALIGNMENT', 'cause ×', 'materielNeed', 'relationToPlayer', 'equipment.', 'history.', 'race.']
}

function expectClean(text: string, state: GameState) {
  for (const token of forbidden(state)) expect(text, token).not.toContain(token)
}

describe('displayNames — inga interna ID:n', () => {
  it('NEWS DESK: förstasidan och arkivet visar kvartal och ord, inte turräknare, fältnamn eller ID:n', () => {
    mockMatchMedia()
    const state = played(8)
    render(<TheWire wire={state.wire} state={state} draft={EMPTY} onChooseCrisis={() => {}} />)
    expectClean(document.body.textContent ?? '', state)
    fireEvent.click(screen.getByRole('radio', { name: /Archive/ }))
    const text = document.body.textContent ?? ''
    expectClean(text, state)
    expect(text).not.toMatch(/\bT0\d\b/)
    expect(text).toMatch(/Q[1-4] 196\d/)
  })

  it('CONTRACTS: ordermappen namnger front och orsak, och kontraktstabellen visar löpnummer', () => {
    const state = played(8)
    const { container } = render(<TheFloor state={state} draft={EMPTY} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    expectClean(container.textContent ?? '', state)
  })

  it('CONTACTS: agendan står i ord och policybeslutet heter cabinet decree', () => {
    const state = played(4)
    const { container } = render(<ThePolitics state={state} onAddAction={() => {}} />)
    expectClean(container.textContent ?? '', state)
  })

  it('agendaLabel och frontName ger ord', () => {
    expect(agendaLabel('SELF_ENRICHMENT')).toBe('Self-enrichment')
    expect(agendaLabel(null)).toBe('Unknown')
    const state = played(0)
    expect(frontName(state, 'front-1')).toBe('Indochina front')
    expect(frontName(state, null)).toBe('No front')
  })
})

describe('displayNames — deltarader', () => {
  it('pengar, doomsday och relationer i ord; interna räknare döljs', () => {
    const state = played(0)
    expect(deltaLabel(state, 'treasury', -250000)).toBe('Treasury −£250,000')
    expect(deltaLabel(state, 'doomsday', 18)).toBe('Doomsday +18')
    expect(deltaLabel(state, 'relations.nlf', -3)).toBe('Relations with National Liberation Front −3')
    expect(deltaLabel(state, 'materielNeed.artillery', 4)).toBeNull()
    expect(deltaLabel(state, 'race.gap.artillery', 1)).toBeNull()
    const official = Object.values(state.officials)[0]!
    expect(deltaLabel(state, `${official.id}.relationToPlayer`, 2)).toBe(`${official.name}: relation +2`)
  })

  it('varje deltarad som visas i åtta botkvartal är ord, aldrig ett fältnamn', () => {
    const state = played(8)
    for (const event of state.wire)
      for (const [key, value] of Object.entries(event.delta)) {
        const label = deltaLabel(state, key, value)
        if (label !== null) expect(label, key).not.toMatch(/[a-z][A-Z]|[a-z]\.[a-z]|_/)
      }
  })
})

describe('displayNames — ordermappens orsak', () => {
  it('en ersättningsorder namnger förbandet och kvartalet, och fronten med sektorn', () => {
    const state = played(0)
    const front = state.fronts['front-1']!
    const formation = front.formations[0]!
    const order = { reason: { kind: 'REPLACE_FORMATION_LOSSES', formationId: formation.id, formationName: formation.name, engagementWireId: 'none' }, frontId: 'front-1' } as unknown as Order
    expect(orderCause(state, order)).toBe(`Replacement for losses of the ${formation.name} in battle.`)
    expect(orderPlace(state, order)).toMatch(/^Indochina front · /)
    expect(orderPlace(state, order)).not.toContain(formation.sectorId)
  })
})
