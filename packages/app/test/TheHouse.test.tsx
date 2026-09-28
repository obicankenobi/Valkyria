// TheHouse.test.tsx — P85 (ETAPP7_TEKNISK_SPEC.md §13). Verifierar de tre
// nya delarna: produktionslinjebanden (P81-16, "vilka produkter den kan
// tillverka" visat ärligt — ingen linje är begränsad till en fast lista),
// Next Quarter-panelen (P81-14/15, läser projectedQuarter ordagrant) och
// R&D-utsikten (P81-17, "vad varje område låser upp och när").
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createInitialState, projectedQuarter } from '@seventh-front/core'
import type { TurnSubmission } from '@seventh-front/core'
import { TheHouse } from '../src/components/TheHouse.js'

afterEach(cleanup)

const EMPTY_DRAFT: TurnSubmission = { standingOrders: [], bids: [], actions: [] }

describe('TheHouse — produktionslinjebanden (P85, P81-16)', () => {
  it('en ledig linje visas ärligt som "Any product" i stället för en påhittad produktlista', () => {
    const state = createInitialState('indochina-slice', 'thehouse-idle-line-seed')
    state.house.lines = [
      {
        id: 'line-1',
        productId: null,
        grade: 'A',
        unitsPerTurnAtFull: state.house.unitsPerLineTurnDefault,
        capacityPct: 100,
        assignedContractId: null,
        status: 'idle',
        blockedReason: null,
        retoolingUntilTurn: null,
      },
    ]

    render(<TheHouse state={state} draft={EMPTY_DRAFT} onAddAction={() => {}} onRemoveAction={() => {}} />)

    const band = screen.getByTestId('production-line-band')
    expect(band.textContent).toContain('Any product')
  })

  it('en tilldelad linje visar produktens namn och en beräknad completes-tur', () => {
    const state = createInitialState('indochina-slice', 'thehouse-running-line-seed')
    const buyerId = Object.keys(state.factions)[0]!
    state.market.contracts = [
      {
        id: 'contract-band',
        buyerId,
        productId: 'm1_rifle',
        quantity: 4000,
        unitsDelivered: 0,
        price: 1_000_000,
        unitCostAtSigning: 290,
        grade: 'A',
        dueTurn: state.meta.turn + 10,
        status: 'active',
        lateEventId: null,
        frontId: null,
      },
    ]
    state.house.lines = [
      {
        id: 'line-1',
        productId: 'm1_rifle',
        grade: 'A',
        unitsPerTurnAtFull: state.house.unitsPerLineTurnDefault,
        capacityPct: 100,
        assignedContractId: 'contract-band',
        status: 'running',
        blockedReason: null,
        retoolingUntilTurn: null,
      },
    ]

    render(<TheHouse state={state} draft={EMPTY_DRAFT} onAddAction={() => {}} onRemoveAction={() => {}} />)

    const band = screen.getByTestId('production-line-band')
    expect(band.textContent).toContain('M-1 Standard Infantry Rifle')
    expect(band.textContent).toContain(`Completes contract T${state.meta.turn + 1}`)
  })
})

describe('TheHouse — Next Quarter-panelen (P85, P81-14/15)', () => {
  it('visar exakt de tal projectedQuarter räknar ut, ingen egen approximation', () => {
    const state = createInitialState('indochina-slice', 'thehouse-nextquarter-seed')
    const q = projectedQuarter(state)

    render(<TheHouse state={state} draft={EMPTY_DRAFT} onAddAction={() => {}} onRemoveAction={() => {}} />)

    const panel = screen.getByText('Next quarter').closest('.panel') ?? document.body
    expect(panel.textContent).toContain(`£${q.expectedRevenueNextTurn.toLocaleString('en-GB')}`)
    expect(panel.textContent).toContain(`£${q.fixedCosts.payroll.toLocaleString('en-GB')}`)
  })
})

describe('TheHouse — POLITICAL flyttat till CONTACTS (P86, P81-18)', () => {
  it('Executive actions-panelen erbjuder inte längre BRIBE/STAGE_INCIDENT/BACK_CHANNEL', () => {
    const state = createInitialState('indochina-slice', 'thehouse-no-political-seed')
    render(<TheHouse state={state} draft={EMPTY_DRAFT} onAddAction={() => {}} onRemoveAction={() => {}} />)

    expect(screen.queryByText('Political')).toBeNull()
    expect(screen.queryByText('Bribe')).toBeNull()
    expect(screen.queryByText('Stage Incident')).toBeNull()
    expect(screen.queryByText('Back Channel')).toBeNull()
  })
})

describe('TheHouse — R&D-utsikten (P85, P81-17)', () => {
  it('visar en rad per techkategori med techLevel och nästa upplåsning', () => {
    const state = createInitialState('indochina-slice', 'thehouse-research-seed')
    state.house.techLevel.infantry = 0

    render(<TheHouse state={state} draft={EMPTY_DRAFT} onAddAction={() => {}} onRemoveAction={() => {}} />)

    const rows = screen.getAllByTestId('research-row')
    expect(rows).toHaveLength(6)
    const infantryRow = rows.find((r) => r.textContent?.includes('INFANTRY'))!
    expect(infantryRow.textContent).toContain('Level 0')
    expect(infantryRow.textContent).toContain('Unlocks')
  })
})
