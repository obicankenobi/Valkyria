// WorksPlan.test.tsx — P179 (ETAPP11_FORSLAG.md §8): tomtplanen, anläggningskortet, byggmenyn och THE COMPANYs fyra lådor.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, facilityCard } from '@seventh-front/core'
import type { StandingOrderChange, TurnSubmission } from '@seventh-front/core'
import { WorksPlan } from '../src/components/WorksPlan.js'
import { TheHouse } from '../src/components/TheHouse.js'

afterEach(cleanup)

const EMPTY: TurnSubmission = { standingOrders: [], bids: [], actions: [] }
const fresh = () => createInitialState('indochina-slice', 'works-plan-seed')

function renderPlan(draft: TurnSubmission = EMPTY, state = fresh()) {
  const onSet = vi.fn<(c: StandingOrderChange) => void>()
  const onRemove = vi.fn<(key: string) => void>()
  render(<WorksPlan state={state} draft={draft} onSet={onSet} onRemove={onRemove} />)
  return { onSet, onRemove, state }
}

describe('tomtplanen (P179)', () => {
  it('visar åtta platser: startpaketets byggnader och resten tomma, med en knapp per plats och rätt markplan', () => {
    const { state } = renderPlan()
    const plan = screen.getByTestId('works-plan')
    expect(plan.querySelectorAll('.works-slot')).toHaveLength(8)
    for (const w of state.house.works) expect(screen.getByTestId(`works-slot-${w.id}`)).toBeTruthy()
    expect(plan.querySelectorAll('.works-slot.is-free')).toHaveLength(8 - state.house.works.length)
    expect(plan.querySelector('.works-ground')?.getAttribute('src')).toBe('/art/works/ground-8.svg')
  })

  it('efter ett markköp ritas tolv platser på den större markplanen och köpknappen är borta', () => {
    const state = fresh()
    state.house.plot = { slots: 12, landBought: true }
    renderPlan(EMPTY, state)
    expect(screen.getByTestId('works-plan').querySelectorAll('.works-slot')).toHaveLength(12)
    expect(screen.getByTestId('works-plan').querySelector('.works-ground')?.getAttribute('src')).toBe('/art/works/ground-12.svg')
    expect(screen.queryByTestId('works-land')).toBeNull()
  })

  it('varje byggnad visar sin lampa som text för skärmläsare, och byggnadens namn och nivå som riktig text', () => {
    const { state } = renderPlan()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    const slot = screen.getByTestId(`works-slot-${assembly.id}`)
    expect(slot.textContent).toContain('ASSEMBLY')
    expect(slot.textContent).toContain(`L${assembly.level}`)
    expect(slot.getAttribute('aria-label')).toMatch(/Assembly Works.*level \d, (running|standing|building)/)
    expect(slot.querySelector('.works-lamp')).toBeTruthy()
    expect(slot.querySelector('img')?.getAttribute('src')).toBe('/art/works/assembly.svg')
  })

  it('ett bygge ritas som byggplats med lampan "building"', () => {
    const state = fresh()
    const lab = state.house.works.find((w) => w.kind === 'laboratory')!
    lab.status = 'under_construction'
    lab.build = { toLevel: 1, startTurn: 0, turnsTotal: 3, turnsLeft: 2, costTotal: 900000, costPerTurn: 300000, forced: false }
    renderPlan(EMPTY, state)
    const slot = screen.getByTestId(`works-slot-${lab.id}`)
    expect(slot.querySelector('img')?.getAttribute('src')).toBe('/art/works/site.svg')
    expect(slot.querySelector('.works-lamp.is-building')).toBeTruthy()
  })

  it('ett tryck på en byggnad öppnar kortet: en mening, status, kostnad och nästa nivå ur kärnan', () => {
    const { state } = renderPlan()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    const card = facilityCard(state, assembly.id)!
    expect(screen.getByTestId('facility-does').textContent).toBe(card.does)
    expect(screen.getByTestId('facility-status').textContent).toContain(card.activity)
    expect(screen.getByTestId('facility-cost').textContent).toContain(`£${card.fixedCost.toLocaleString('en-GB')}`)
    expect(screen.getByTestId('facility-next').textContent).toContain(`£${card.next!.cost.toLocaleString('en-GB')}`)
    expect(screen.getByTestId('facility-condition')).toBeTruthy()
    expect(screen.getByTestId('facility-staffing')).toBeTruthy()
  })

  it('"Expand" köar en WORKS EXPAND-order och stänger kortet; "forced" skickar forced', () => {
    const { state, onSet } = renderPlan()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    fireEvent.click(screen.getByTestId('facility-expand'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'WORKS', op: 'EXPAND', facilityId: assembly.id })
    expect(screen.queryByTestId('facility-card')).toBeNull()

    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    fireEvent.click(within(screen.getByTestId('facility-pace')).getByRole('radio', { name: /FORCED/ }))
    fireEvent.click(screen.getByTestId('facility-expand'))
    expect(onSet).toHaveBeenLastCalledWith({ kind: 'WORKS', op: 'EXPAND', facilityId: assembly.id, forced: true })
  })

  it('bemanning och underhåll köas som WORKFORCE respektive MAINTENANCE', () => {
    const { state, onSet } = renderPlan()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    fireEvent.click(within(screen.getByTestId('facility-staffing-set')).getByRole('radio', { name: '50%' }))
    fireEvent.click(screen.getByTestId('facility-staffing-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'WORKFORCE', op: 'SET', facilityId: assembly.id, staffing: 50 })

    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    fireEvent.click(within(screen.getByTestId('facility-maintenance-set')).getByRole('radio', { name: 'HIGH' }))
    fireEvent.click(screen.getByTestId('facility-maintenance-file'))
    expect(onSet).toHaveBeenLastCalledWith({ kind: 'MAINTENANCE', facilityId: assembly.id, level: 'high' })
  })

  it('en strejk visar svaren "give in" och "break it"', () => {
    const state = fresh()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    assembly.status = 'strike'
    assembly.strike = { sinceTurn: 0 }
    const { onSet } = renderPlan(EMPTY, state)
    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    expect(screen.getByTestId('facility-status').textContent).toContain('Standing')
    fireEvent.click(screen.getByTestId('facility-strike-concede'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'WORKFORCE', op: 'STRIKE', facilityId: assembly.id, response: 'concede' })
  })

  it('ett tryck på en tom plats öppnar byggmenyn med alla sju slagen, pris och byggtid ur datafilen', () => {
    renderPlan()
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    const menu = screen.getByTestId('build-menu')
    for (const kind of ['assembly', 'component', 'laboratory', 'design', 'proving', 'depot', 'civil']) expect(within(menu).getByTestId(`build-option-${kind}`)).toBeTruthy()
    expect(within(menu).getByTestId('build-option-depot').textContent).toMatch(/£[\d,]+ · \d quarters/)
  })

  it('att bygga ett monteringsverk kräver en kategori och köas som WORKS BUILD; forcerat skickar forced', () => {
    const { onSet } = renderPlan()
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-assembly'))
    fireEvent.click(within(screen.getByTestId('build-category')).getByRole('radio', { name: 'ARM' }))
    fireEvent.click(screen.getByTestId('build-file'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'WORKS', op: 'BUILD', facilityKind: 'assembly', category: 'armour' })

    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-depot'))
    fireEvent.click(within(screen.getByTestId('build-pace')).getByRole('radio', { name: /FORCED/ }))
    fireEvent.click(screen.getByTestId('build-file'))
    expect(onSet).toHaveBeenLastCalledWith({ kind: 'WORKS', op: 'BUILD', facilityKind: 'depot', forced: true })
  })

  it('en blockerad byggnad kan inte köas och visar skälet i klartext', () => {
    renderPlan()
    fireEvent.click(screen.getByTestId('works-slot-free-7'))
    fireEvent.click(screen.getByTestId('build-option-design')) // startpaketet har redan sitt enda ritkontor
    expect((screen.getByTestId('build-file') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('build-reason').textContent).toMatch(/most/)
  })

  it('en köad byggnad tar nästa lediga plats och kan ångras med ett tryck', () => {
    const queued: StandingOrderChange = { kind: 'WORKS', op: 'BUILD', facilityKind: 'depot' }
    const { state, onRemove } = renderPlan({ ...EMPTY, standingOrders: [queued] })
    const slot = screen.getByTestId(`works-slot-queued-${state.house.works.length}`)
    expect(slot.textContent).toContain('DEPOT')
    expect(slot.textContent).toContain('QUEUED')
    fireEvent.click(slot)
    expect(onRemove).toHaveBeenCalledWith('works-build:depot:')
  })

  it('markköp: knappen köar BUY_LAND och en köad order kan ångras', () => {
    const { onSet } = renderPlan()
    fireEvent.click(screen.getByTestId('works-land-buy'))
    expect(onSet).toHaveBeenCalledWith({ kind: 'WORKS', op: 'BUY_LAND' })
    cleanup()
    const { onRemove } = renderPlan({ ...EMPTY, standingOrders: [{ kind: 'WORKS', op: 'BUY_LAND' }] })
    fireEvent.click(screen.getByTestId('works-land-undo'))
    expect(onRemove).toHaveBeenCalledWith('works-land')
  })

  it('en köad ändring av en anläggning visas på kortet med "undo"', () => {
    const state = fresh()
    const assembly = state.house.works.find((w) => w.kind === 'assembly')!
    const queued: StandingOrderChange = { kind: 'MAINTENANCE', facilityId: assembly.id, level: 'low' }
    const { onRemove } = renderPlan({ ...EMPTY, standingOrders: [queued] }, state)
    fireEvent.click(screen.getByTestId(`works-slot-${assembly.id}`))
    const box = screen.getByTestId('facility-queued')
    expect(box.textContent).toContain('Maintenance low')
    fireEvent.click(within(box).getByText('undo'))
    expect(onRemove).toHaveBeenCalledWith(`maintenance:${assembly.id}`)
  })
})

describe('THE COMPANY i fyra lådor (P179)', () => {
  const house = (props: Partial<Parameters<typeof TheHouse>[0]> = {}) =>
    render(<TheHouse state={fresh()} draft={EMPTY} onAddAction={() => {}} onRemoveAction={() => {}} {...props} />)

  it('har fyra flikar — Works, Drawing office, Books, Legal — och Works är öppen från start', () => {
    house()
    const tabs = within(screen.getByTestId('company-drawers')).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Works', 'Drawing office', 'Books', 'Legal'])
    expect(screen.getByTestId('company-drawer-works').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('works-plan')).toBeTruthy()
    expect(screen.queryByText('Balance sheet')).toBeNull()
    expect(screen.queryByTestId('drawing-board')).toBeNull()
  })

  it('varje låda visar sitt: Books har balansen, Drawing office ritbordet, Legal pappersspåret', () => {
    house()
    fireEvent.click(screen.getByTestId('company-drawer-books'))
    expect(screen.getByText('Balance sheet')).toBeTruthy()
    expect(screen.getByText('Next quarter')).toBeTruthy()
    expect(screen.getByText('Board target', { exact: false })).toBeTruthy()
    expect(screen.queryByTestId('works-plan')).toBeNull()
    fireEvent.click(screen.getByTestId('company-drawer-drawing'))
    expect(screen.getByTestId('drawing-board')).toBeTruthy()
    fireEvent.click(screen.getByTestId('company-drawer-legal'))
    expect(screen.getByTestId('paper-trail')).toBeTruthy()
  })

  it('ett hopp från This Quarter till pappersspåret öppnar Legal, ett till ett linjekort öppnar Works', () => {
    house({ focusCard: 'paper-trail' })
    expect(screen.getByTestId('company-drawer-legal').getAttribute('aria-selected')).toBe('true')
    cleanup()
    house({ focusCard: 'line-1' })
    expect(screen.getByTestId('company-drawer-works').getAttribute('aria-selected')).toBe('true')
  })

  it('standing orders-tavlan (linjer, avtal, stationer) ligger kvar i Works, med tomtplanen överst', () => {
    house()
    expect(screen.getByTestId('standing-orders-board')).toBeTruthy()
    const works = screen.getByTestId('works-plan')
    const board = screen.getByTestId('standing-orders-board')
    expect(works.compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
