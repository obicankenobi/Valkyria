// @vitest-environment jsdom
// YourActions.test.tsx — P164 (ETAPP10_FORSLAG.md §3b, S3): resultatrapporten på NEWS DESK, i ett riktigt <App/> och som isolerad komponent.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, resolveTurn } from '@seventh-front/core'
import type { PlayerAction } from '@seventh-front/core'
import { App } from '../src/App.js'
import { YourActions } from '../src/components/YourActions.js'

afterEach(cleanup)

async function enterGame() {
  render(<App />)
  fireEvent.click(await screen.findByTestId('menu-new-game'))
  fireEvent.click(await screen.findByTestId('newgame-submit'))
  fireEvent.click(await screen.findByTestId('briefing-begin'))
  await screen.findByTestId('hud')
}

describe('YourActions — isolerad', () => {
  it('visar en rad per handling med status, utfall och orsakskedja', () => {
    const before = createInitialState('indochina-slice', 'wire-dump')
    before.house.treasury = 5_000_000
    const st = before.house.stations[0]!
    const rival = Object.values(before.rivals)[0]!
    const actions: PlayerAction[] = [
      { type: 'INTEL', op: 'EXPAND', stationId: st.id },
      { type: 'INTEL', op: 'LEAK', stationId: st.id, targetId: rival.id },
      { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefSalesman' } },
      { type: 'INTERNAL', op: 'HIRE', payload: { role: 'chiefEngineer' } }, // fjärde: ingen poäng kvar
    ]
    const submission = { standingOrders: [], bids: [], actions }
    const result = resolveTurn(before, submission)
    render(<YourActions input={{ before, submission, wire: result.wire, rejected: result.rejected }} />)

    const list = screen.getByTestId('your-actions-list')
    const items = within(list).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('your-action-action'))
    expect(items).toHaveLength(4)
    expect(items[0]!.textContent).toMatch(/Expand a station/)
    expect(items[0]!.textContent).toMatch(/DONE/)
    expect(items[1]!.textContent).toMatch(/FAILED/)
    expect(items[1]!.textContent).toMatch(/TRACED BACK/)
    expect(within(items[1]!).getByTestId('your-action-chain').textContent).toMatch(/COUNTER-INTELLIGENCE SERVICE SHARPENS/)
    expect(items[3]!.textContent).toMatch(/REJECTED/)
    expect(items[3]!.textContent).toMatch(/Not carried out: no executive actions remaining/)
  })

  it('utan en rapport, eller utan handlingar, visas ingenting', () => {
    const { container, rerender } = render(<YourActions input={null} />)
    expect(container.firstChild).toBeNull()
    const before = createInitialState('indochina-slice', 'empty-report')
    const submission = { standingOrders: [], bids: [], actions: [] }
    const result = resolveTurn(before, submission)
    rerender(<YourActions input={{ before, submission, wire: result.wire, rejected: result.rejected }} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('NEWS DESK (P164) — "Your actions" efter ett riktigt kvartal', () => {
  it('en köad handling syns på förstasidan efter End Quarter, med sitt utfall', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('tab-company'))
    fireEvent.click(screen.getByTestId('company-hire-file'))
    fireEvent.click(screen.getByTestId('end-quarter-button'))
    fireEvent.click(await screen.findByTestId('replay-skip'))
    const list = await screen.findByTestId('your-actions-list')
    expect(list.textContent).toMatch(/Hire staff/)
    expect(list.textContent).toMatch(/HIRES A NEW CHIEF/)
    expect(list.textContent).toMatch(/DONE/)
    expect(screen.getByTestId('news-front-page').contains(list)).toBe(true)
  })

  it('en avvisad handling står i samma lista, med orsaken', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('tab-company'))
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByTestId('company-hire-file'))
    fireEvent.click(screen.getByTestId('end-quarter-button'))
    fireEvent.click(await screen.findByTestId('replay-skip'))
    const list = await screen.findByTestId('your-actions-list')
    expect(list.textContent).toMatch(/REJECTED/)
    expect(list.textContent).toMatch(/Not carried out: no executive actions remaining/)
    expect(list.textContent!.match(/DONE/g)!.length).toBe(3)
  })

  it('ett kvartal utan handlingar ger ingen panel', async () => {
    await enterGame()
    fireEvent.click(screen.getByTestId('end-quarter-button'))
    fireEvent.click(await screen.findByTestId('replay-skip'))
    await screen.findByTestId('news-front-page')
    expect(screen.queryByTestId('your-actions-list')).toBeNull()
  })
})
