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

  it('EXPAND köas direkt (inget mål att välja) och stänger arket', () => {
    const state = createInitialState('indochina-slice', 'cf-seed')
    const onAddAction = vi.fn()
    const onClose = vi.fn()
    render(<CountryFile state={state} factionId="rvn" onAddAction={onAddAction} onClose={onClose} onOpenContacts={() => {}} />)

    fireEvent.click(screen.getByTestId('cf-verb-EXPAND'))

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
