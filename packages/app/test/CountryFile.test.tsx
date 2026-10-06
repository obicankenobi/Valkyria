// CountryFile.test.tsx — P79 (ETAPP7_TEKNISK_SPEC.md §7.1/§13). Klart-när,
// ordagrant: "alla sex underrättelseverb går att köa från kartan ... i en
// e2e-tur" — den fulla resolveTurn-parityn täcks av
// e2e/play-20-turns.spec.ts:s nya INTEL-scenario; den här filen verifierar
// att VARJE knapp faktiskt bygger och köar rätt PlayerAction, plus
// målväljarna och INFLUENCE-formuläret (P79:s enda inkopplade
// POLITICAL-exempel, se CountryFile.tsx:s egen scope-kommentar).
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, officialId, validateAction } from '@seventh-front/core'
import type { PlayerAction } from '@seventh-front/core'
import { CountryFile } from '../src/components/CountryFile.js'

afterEach(cleanup)

describe('CountryFile — COVERT (P79 klart-när: alla sex underrättelseverb köbara)', () => {
  it('ett land MED station visar EXPAND/WITHDRAW/LEAK/SABOTAGE/TURN, stationens namn och exponering', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    render(<CountryFile state={state} factionId="rvn" onAddAction={() => {}} onClose={() => {}} onOpenContacts={() => {}} />)

    expect(screen.getByTestId('cf-verb-EXPAND')).toBeTruthy()
    expect(screen.getByTestId('cf-verb-WITHDRAW')).toBeTruthy()
    expect(screen.getByTestId('cf-verb-LEAK')).toBeTruthy()
    expect(screen.getByTestId('cf-verb-SABOTAGE')).toBeTruthy()
    expect(screen.getByTestId('cf-verb-TURN')).toBeTruthy()
    expect(screen.queryByTestId('cf-verb-RECRUIT')).toBeNull()
    expect(screen.getByTestId('cf-station').textContent).toContain('SAIGON')
    expect(screen.getByTestId('cf-exposure')).toBeTruthy()
  })

  it('ett land UTAN station visar bara RECRUIT och "NO COVERAGE", ingen exponeringsmätare', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    render(<CountryFile state={state} factionId="laos" onAddAction={() => {}} onClose={() => {}} onOpenContacts={() => {}} />)

    expect(screen.getByTestId('cf-verb-RECRUIT')).toBeTruthy()
    expect(screen.queryByTestId('cf-verb-EXPAND')).toBeNull()
    expect(screen.getByTestId('cf-station').textContent).toBe('NO COVERAGE')
    expect(screen.queryByTestId('cf-exposure')).toBeNull()
  })

  it('EXPAND visar först sitt kort, och köas med FILE (inget mål att välja) som stänger arket', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    const onClose = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={onClose} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-EXPAND'))
    expect(onAddAction).not.toHaveBeenCalled() // P163: kortet först
    expect(screen.getByTestId('action-card-EXPAND')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cf-file-EXPAND'))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTEL', op: 'EXPAND', stationId: 'station-1' })
    expect(onClose).toHaveBeenCalled()
  })

  it('LEAK öppnar en målväljare med alla rivalhus, och köar med rätt targetId', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={() => {}} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-LEAK'))
    expect(screen.getByTestId('cf-target-picker-LEAK')).toBeTruthy()
    const rivalIds = Object.keys(state.rivals)
    expect(rivalIds.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTestId(`cf-target-${rivalIds[0]}`))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTEL', op: 'LEAK', stationId: 'station-1', targetId: rivalIds[0] })
  })

  it('TURN öppnar en målväljare med landets aktiva tjänstemän, och köar med rätt officialId', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={() => {}} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-TURN'))
    const target = officialId('rvn', 'procurement')
    fireEvent.click(screen.getByTestId(`cf-target-${target}`))

    expect(onAddAction).toHaveBeenCalledWith({ type: 'INTEL', op: 'TURN', stationId: 'station-1', targetId: target })
  })

  it('RECRUIT avvisas av validateAction (maxStations nått) och knappen inaktiveras, ingen action köas', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    // Fyll på tills validateAction själv säger ifrån — samma sanningskälla
    // som CountryFile.tsx faktiskt gate:ar knappen med, i stället för att
    // upprepa balance.json:s maxStations-tal här.
    const recruit: PlayerAction = { type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' }
    let guard = 0
    while (validateAction(state, state, recruit).ok && guard < 50) {
      state.house.stations.push({
        id: `station-extra-${state.house.stations.length}`,
        city: 'TEST',
        nation: 'rvn',
        depth: 0,
        exposure: 0,
        coverage: ['procurement'],
        status: 'active',
      })
      guard++
    }
    expect(validateAction(state, state, recruit).ok).toBe(false)
    const onAddAction = vi.fn()
    render(<CountryFile state={state} factionId="laos" onAddAction={onAddAction} onClose={() => {}} onOpenContacts={() => {}} />)

    const button = screen.getByTestId('cf-verb-RECRUIT') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(button)
    expect(onAddAction).not.toHaveBeenCalled()
  })

  it('OFFICIALS-länken visar antal tjänstemän och navigerar till CONTACTS', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onOpenContacts = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={() => {}} onClose={() => {}} onOpenContacts={onOpenContacts} />)

    expect(screen.getByTestId('cf-officials-link').textContent).toContain('4 ON FILE')
    fireEvent.click(screen.getByTestId('cf-officials-link'))
    expect(onOpenContacts).toHaveBeenCalled()
  })
})

describe('CountryFile — INFLUENCE (P79:s enda inkopplade POLITICAL-verb)', () => {
  it('visar en beräknad före/efter-siffra som följer tier-valet, och FILE köar rätt spend', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    const onClose = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={onClose} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-INFLUENCE'))
    expect(screen.getByTestId('cf-influence-preview').textContent).toContain('PUBLIC SUPPORT')

    fireEvent.click(screen.getByTestId('cf-influence-file'))
    expect(onAddAction).toHaveBeenCalledTimes(1)
    const filed = onAddAction.mock.calls[0]![0]
    expect(filed.type).toBe('POLITICAL')
    expect(filed.op).toBe('INFLUENCE')
    expect(filed.targetFactionId).toBe('rvn')
    expect(filed.effect).toEqual({ kind: 'publicSupport' })
    expect(filed.spend).toBeGreaterThan(0)
    expect(onClose).toHaveBeenCalled()
  })

  it('BACK-knappen återgår till översikten utan att köa något', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={() => {}} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-INFLUENCE'))
    fireEvent.click(screen.getByTestId('cf-influence-back'))

    expect(screen.getByTestId('cf-verb-EXPAND')).toBeTruthy()
    expect(onAddAction).not.toHaveBeenCalled()
  })
})


describe('CountryFile — handlingskortet och stationskortet (P163)', () => {
  const baseProps = { onAddAction: () => {}, onClose: () => {}, onOpenContacts: () => {} }

  it('WITHDRAW och RECRUIT går också via ett kort och köas med FILE', () => {
    const withdrawState = createInitialState('indochina-slice', 'cf-card-seed')
    const onAdd = vi.fn()
    const { unmount } = render(<CountryFile {...baseProps} onAddAction={onAdd} state={withdrawState} factionId="rvn" />)
    fireEvent.click(screen.getByTestId('cf-verb-WITHDRAW'))
    expect(screen.getByTestId('action-card-WITHDRAW')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cf-file-WITHDRAW'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'INTEL', op: 'WITHDRAW', stationId: 'station-1' })
    unmount()

    const recruitState = createInitialState('indochina-slice', 'cf-card-seed')
    const onAdd2 = vi.fn()
    render(<CountryFile {...baseProps} onAddAction={onAdd2} state={recruitState} factionId="laos" />)
    fireEvent.click(screen.getByTestId('cf-verb-RECRUIT'))
    fireEvent.click(screen.getByTestId('cf-file-RECRUIT'))
    expect(onAdd2).toHaveBeenCalledWith({ type: 'INTEL', op: 'RECRUIT', stationId: '', targetId: 'laos' })
  })

  it('en vilande station (P167): landsakten erbjuder REOPEN, inte RECRUIT, och köar REOPEN med FILE', () => {
    const state = createInitialState('indochina-slice', 'cf-reopen-seed')
    state.house.stations[0]!.status = 'dormant'
    const onAdd = vi.fn()
    render(<CountryFile {...baseProps} onAddAction={onAdd} state={state} factionId="rvn" />)
    expect(screen.queryByTestId('cf-verb-RECRUIT')).toBeNull()
    expect(screen.queryByTestId('cf-verb-EXPAND')).toBeNull()
    fireEvent.click(screen.getByTestId('cf-verb-REOPEN'))
    expect(screen.getByTestId('action-card-REOPEN')).toBeTruthy()
    fireEvent.click(screen.getByTestId('cf-file-REOPEN'))
    expect(onAdd).toHaveBeenCalledWith({ type: 'INTEL', op: 'REOPEN', stationId: 'station-1' })
  })

  it('en aktiv station visar inte REOPEN', () => {
    const state = createInitialState('indochina-slice', 'cf-reopen-active-seed')
    render(<CountryFile {...baseProps} state={state} factionId="rvn" />)
    expect(screen.queryByTestId('cf-verb-REOPEN')).toBeNull()
  })

  it('målväljaren för LEAK visar kortet med chans (ur previewAction) ovanför listan', () => {
    const state = createInitialState('indochina-slice', 'cf-card-seed')
    state.house.stations[0]!.depth = 2
    render(<CountryFile {...baseProps} state={state} factionId="rvn" />)
    fireEvent.click(screen.getByTestId('cf-verb-LEAK'))
    expect(screen.getByTestId('action-card-LEAK')).toBeTruthy()
    expect(screen.getByTestId('action-card-chance').textContent).toMatch(/^\d+%$/)
  })

  it('INFLUENCE-formuläret visar kortet, och en effekt före → efter', () => {
    const state = createInitialState('indochina-slice', 'cf-card-seed')
    render(<CountryFile {...baseProps} state={state} factionId="rvn" />)
    fireEvent.click(screen.getByTestId('cf-verb-INFLUENCE'))
    expect(screen.getByTestId('action-card-INFLUENCE')).toBeTruthy()
    expect(screen.getByTestId('action-card-effect').textContent).toMatch(/PUBLIC SUPPORT \d+ → ~\d+/)
  })

  it('landsakten visar stationskortet: vad en station är, vad just den ger och nästa nivå', () => {
    const state = createInitialState('indochina-slice', 'cf-card-seed')
    state.house.staff.chiefSalesman = 0
    state.house.stations[0]!.depth = 1
    render(<CountryFile {...baseProps} state={state} factionId="rvn" />)
    expect(screen.getByTestId('station-card-what').textContent).toMatch(/intelligence post in a country/)
    expect(screen.getByTestId('station-card-summary').textContent).toContain('±22%')
    expect(screen.queryByTestId('station-card-bands')).toBeNull() // detaljerna ligger bakom knappen (regel 7)
    fireEvent.click(screen.getByTestId('station-card-toggle'))
    expect(screen.getByTestId('station-card-bands').textContent).toContain('±22%')
    expect(screen.getByTestId('station-card-verbs').textContent).toContain('EXPAND, WITHDRAW, LEAK, SABOTAGE, TURN')
    expect(screen.getByTestId('station-card-next').textContent).toMatch(/EXPAND to depth 2.*±22% to ±14%/)
  })

  it('ett land utan station: kortet säger att inget låses upp och att RECRUIT är vägen', () => {
    const state = createInitialState('indochina-slice', 'cf-card-seed')
    state.house.staff.chiefSalesman = 0
    render(<CountryFile {...baseProps} state={state} factionId="laos" />)
    fireEvent.click(screen.getByTestId('station-card-toggle'))
    expect(screen.getByTestId('station-card-verbs').textContent).toMatch(/RECRUIT opens a station here/)
    expect(screen.getByTestId('station-card-formations').textContent).toMatch(/strength unknown|None here/)
    expect(screen.getByTestId('station-card-next').textContent).toMatch(/^RECRUIT/)
  })
})
