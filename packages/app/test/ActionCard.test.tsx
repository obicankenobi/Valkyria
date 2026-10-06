// @vitest-environment jsdom
// ActionCard.test.tsx — P163 (ETAPP10_FORSLAG.md §3b, S3): ett kort för alla verb, talen ur previewAction.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createInitialState, previewAction } from '@seventh-front/core'
import type { PlayerAction } from '@seventh-front/core'
import { ActionCard } from '../src/components/ActionCard.js'
import { formatMoney } from '../src/components/ui.js'
import { ACTION_INFO } from '../src/actionInfo.js'
import { ACTION_CATALOG } from '../src/actionCatalog.js'
import { VERB_TOPIC } from '../src/handbook.js'
import { HandbookContext } from '../src/uiContext.js'

afterEach(cleanup)

const state = () => createInitialState('indochina-slice', 'action-card-seed')

describe('ActionCard', () => {
  it('visar en mening, kostnad, chans, vad du får och vad du riskerar — kostnaden ur previewAction', () => {
    const s = state()
    const action: PlayerAction = { type: 'INTEL', op: 'EXPAND', stationId: s.house.stations[0]!.id }
    render(<ActionCard state={s} verb="EXPAND" action={action} />)
    expect(screen.getByTestId('action-card-does').textContent).toBe(ACTION_INFO.EXPAND!.does)
    expect(screen.getByTestId('action-card-cost').textContent).toBe(formatMoney(previewAction(s, action).cost!))
    expect(screen.getByTestId('action-card-chance').textContent).toBe('Always works')
    expect(screen.getByTestId('action-card-gain').textContent).toContain(ACTION_INFO.EXPAND!.gain)
    expect(screen.getByTestId('action-card-risk').textContent).toBe(ACTION_INFO.EXPAND!.risk)
  })

  it('chansen är "Unknown" utan underrättelse, och ett tal ur previewAction med den', () => {
    const s = state()
    const station = s.house.stations[0]!
    const rival = Object.values(s.rivals)[0]!
    const action: PlayerAction = { type: 'INTEL', op: 'LEAK', stationId: station.id, targetId: rival.id }
    station.depth = 0
    s.house.staff.chiefSalesman = 0
    const { unmount } = render(<ActionCard state={s} verb="LEAK" action={action} />)
    expect(screen.getByTestId('action-card-chance').textContent).toMatch(/^Unknown/)
    unmount()

    station.depth = 3
    render(<ActionCard state={s} verb="LEAK" action={action} />)
    const pct = previewAction(s, action).successPct!
    expect(screen.getByTestId('action-card-chance').textContent).toBe(`${Math.round(pct)}%`)
  })

  it('en beräknad effekt visas som före → efter (INFLUENCE)', () => {
    const s = state()
    const faction = s.factions.rvn!
    const action: PlayerAction = { type: 'POLITICAL', op: 'INFLUENCE', targetFactionId: faction.id, spend: 45000, direction: 'up', effect: { kind: 'publicSupport' } }
    render(<ActionCard state={s} verb="INFLUENCE" action={action} />)
    const effect = previewAction(s, action).effect!
    expect(screen.getByTestId('action-card-effect').textContent).toBe(`${effect.label} ${Math.round(effect.before)} → ~${Math.round(effect.after)}`)
  })

  it('ett verb utan beloppsförhandsvisning (FAVOUR) säger vad priset är i stället för "free"', () => {
    const s = state()
    const official = Object.values(s.officials)[0]!
    render(<ActionCard state={s} verb="FAVOUR" action={{ type: 'POLITICAL', op: 'FAVOUR', officialId: official.id, marginCost: 5 }} />)
    expect(screen.getByTestId('action-card-cost').textContent).toBe(ACTION_INFO.FAVOUR!.costNote)
  })

  it('utan en handling (verbet valt, inget mål än) ber kortet om ett mål i stället för att gissa ett tal', () => {
    render(<ActionCard state={state()} verb="BRIBE" action={null} />)
    expect(screen.getByTestId('action-card-cost').textContent).toBe('Shown once you choose a target')
    expect(screen.getByTestId('action-card-does').textContent).toBe(ACTION_INFO.BRIBE!.does)
  })

  it('ett okänt verb ger inget kort', () => {
    const { container } = render(<ActionCard state={state()} verb="NO_SUCH_VERB" action={null} />)
    expect(container.firstChild).toBeNull()
  })

  it.each(ACTION_CATALOG.map((e) => e.verb))('%s: länken öppnar just det handboksuppslag VERB_TOPIC pekar på', (verb) => {
    const open = vi.fn()
    render(
      <HandbookContext.Provider value={open}>
        <ActionCard state={state()} verb={verb} action={null} />
      </HandbookContext.Provider>,
    )
    fireEvent.click(within(screen.getByTestId(`action-card-${verb}`)).getByTestId(`action-card-handbook-${verb}`))
    expect(open).toHaveBeenCalledWith(VERB_TOPIC[verb])
  })

  it('utan handbok i trädet finns ingen länk', () => {
    render(<ActionCard state={state()} verb="BRIBE" action={null} />)
    expect(screen.queryByTestId('action-card-handbook-BRIBE')).toBeNull()
  })
})
