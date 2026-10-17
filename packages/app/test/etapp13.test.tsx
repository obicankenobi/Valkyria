// etapp13.test.tsx — etapp 13 (docs/ETAPP13_FORSLAG.md): P199 registerflikarna i CONTRACTS, CONTACTS och THE COMPANY, och P200 stödmätaren.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DISPLAY_THRESHOLDS, createInitialState } from '@seventh-front/core'
import type { GameState } from '@seventh-front/core'
import { TheFloor } from '../src/components/TheFloor.js'
import { ThePolitics } from '../src/components/ThePolitics.js'
import { supportOutlook, supportSentence } from '../src/supportOutlook.js'
import { deriveThisQuarter } from '../src/thisQuarter.js'
import { layerTags } from '../src/mapLayers.js'

afterEach(cleanup)

const EMPTY = { standingOrders: [], bids: [], actions: [] }
const fresh = (seed = 'etapp13'): GameState => createInitialState('indochina-slice', seed)

describe('P199 — CONTRACTS i tre flikar', () => {
  it('Orders visas först; Tenders och Arms race bara när deras flik är vald', () => {
    render(<TheFloor state={fresh()} draft={EMPTY} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    expect(screen.getByTestId('contracts-tabs-orders').getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByTestId('race-chain')).toBeNull()
    fireEvent.click(screen.getByTestId('contracts-tabs-race'))
    expect(screen.getByTestId('race-chain')).toBeTruthy()
    fireEvent.click(screen.getByTestId('contracts-tabs-tenders'))
    expect(screen.getByTestId('programmes-empty')).toBeTruthy()
  })

  it('pilarna flyttar mellan flikarna', () => {
    render(<TheFloor state={fresh()} draft={EMPTY} onSubmitBid={() => {}} onRemoveBid={() => {}} />)
    fireEvent.keyDown(screen.getByTestId('contracts-tabs-orders'), { key: 'ArrowRight' })
    expect(screen.getByTestId('contracts-tabs-tenders').getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(screen.getByTestId('contracts-tabs-tenders'), { key: 'ArrowLeft' })
    fireEvent.keyDown(screen.getByTestId('contracts-tabs-orders'), { key: 'ArrowLeft' })
    expect(screen.getByTestId('contracts-tabs-race').getAttribute('aria-selected')).toBe('true')
  })
})

describe('P199 — CONTACTS: ett land per flik', () => {
  it('visar bara det valda landets tjänstemän, och focusFactionId öppnar på rätt land', () => {
    const state = fresh()
    const { rerender } = render(<ThePolitics state={state} onAddAction={() => {}} />)
    const laosOfficial = Object.values(state.officials).find((o) => o.factionId === 'laos')!
    expect(screen.queryByTestId(`official-post-role-${laosOfficial.id}`)).toBeNull()
    rerender(<ThePolitics state={state} onAddAction={() => {}} focusFactionId="laos" />)
    expect(screen.getByTestId(`official-post-role-${laosOfficial.id}`)).toBeTruthy()
    expect(screen.getByTestId('contacts-tabs-laos').getAttribute('aria-selected')).toBe('true')
  })
})

describe('P200 — stödmätaren', () => {
  it('räknar kvartalen till fred ur samma gräns och antal som factions.ts dömer efter', () => {
    const state = fresh()
    const laos = state.factions['laos']!
    laos.publicSupport = DISPLAY_THRESHOLDS.lowSupportThreshold - 3
    laos.lowSupportTurns = 1
    const o = supportOutlook(state, 'laos')!
    expect(o.below).toBe(true)
    expect(o.atWar).toBe(true)
    expect(o.quartersToPeace).toBe(DISPLAY_THRESHOLDS.lowSupportTurns - 1)
    expect(supportSentence(o)).toMatch(/sue for peace and its orders stop/)
  })

  it('CONTACTS visar mätaren med fredsgränsen, fliken blir röd, This Quarter varnar och POL-lagret visar ▼', () => {
    const state = fresh()
    const laos = state.factions['laos']!
    laos.publicSupport = DISPLAY_THRESHOLDS.lowSupportThreshold - 3
    laos.lowSupportTurns = 1
    render(<ThePolitics state={state} onAddAction={() => {}} focusFactionId="laos" />)
    expect(screen.getByTestId('contacts-support-laos').textContent).toMatch(/Public support/)
    expect(screen.getByTestId('contacts-support-note-laos').textContent).toMatch(/Below/)
    expect(screen.getByTestId('contacts-tabs-laos').className).toContain('is-alert')

    const row = deriveThisQuarter(state).find((i) => i.id === 'support-laos')!
    expect(row.target).toEqual({ view: 'contacts', factionId: 'laos' })
    expect(row.label).toMatch(/peace in \d+ quarters|peace next quarter/)

    const tag = layerTags(state, 'politics').find((t) => t.id === 'laos')
    expect(tag?.lines.join(' ')).toMatch(/▼ 1\/\d/)
  })

  it('ett land långt över gränsen ger ingen rad i This Quarter', () => {
    const state = fresh()
    for (const f of Object.values(state.factions)) f.publicSupport = 90
    expect(deriveThisQuarter(state).some((i) => i.kind === 'support')).toBe(false)
  })
})
