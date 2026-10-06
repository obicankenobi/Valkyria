// staffRoles.test.tsx — P162 (ETAPP10_FORSLAG.md §3b): en anställning (`HIRE`, +15) ger ingen effekt förrän rollen passerar sin tröskel, och det
// ska stå på kortet. Trösklarna i appen binds här mot kärnan: balanstalen läses ur balance.json, och chefsförsäljarens 75 (hårdkodad i
// core/queries.ts) prövas genom att faktiskt köra effectiveDepth på båda sidor om gränsen.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createInitialState, effectiveDepth } from '@seventh-front/core'
import { HIRE_GAIN, STAFF_ROLES, hireOutlook } from '../src/staffRoles.js'
import { InternalActionsForm } from '../src/components/CompanyActions.js'
import balance from '../../core/src/data/balance.json'

afterEach(cleanup)

describe('staffRoles — trösklarna stämmer med kärnan', () => {
  it('hireGain och de två balansbundna trösklarna läses ur balance.json', () => {
    const b = balance as unknown as Record<string, number>
    expect(HIRE_GAIN).toBe(b['hireGain'])
    expect(STAFF_ROLES.chiefEngineer.threshold).toBe(b['chiefEngineerProjectThreshold'])
    expect(STAFF_ROLES.chiefOfStaff.threshold).toBe(b['chiefOfStaffActionBonusThreshold'])
  })

  it('chefsförsäljaren ger +1 djup först över 75, inte vid 75', () => {
    const state = createInitialState('indochina-slice', 'staff-salesman-seed')
    const station = state.house.stations.find((s) => s.status === 'active')
    expect(station, 'scenariot ska ha en aktiv station').toBeTruthy()
    station!.depth = 2
    state.house.staff.chiefSalesman = STAFF_ROLES.chiefSalesman.threshold
    const at = effectiveDepth(state, station!.nation)
    state.house.staff.chiefSalesman = STAFF_ROLES.chiefSalesman.threshold + 1
    expect(effectiveDepth(state, station!.nation)).toBe(at + 1)
  })
})

describe('hireOutlook', () => {
  it('under tröskeln: ingen effekt nu, och hur många anställningar som krävs', () => {
    const o = hireOutlook('chiefEngineer', 45)
    expect(o).toMatchObject({ current: 45, after: 60, threshold: 70, activeNow: false, activeAfter: false })
    expect(o.hiresToActivate).toBe(2) // 45 → 60 → 75
  })
  it('en anställning som korsar tröskeln säger det', () => {
    const o = hireOutlook('chiefEngineer', 60)
    expect(o).toMatchObject({ after: 75, activeNow: false, activeAfter: true, hiresToActivate: 1 })
  })
  it('exakt på tröskeln räknas inte (rollen måste passera den)', () => {
    expect(hireOutlook('chiefOfStaff', 70).activeNow).toBe(false)
    expect(hireOutlook('chiefOfStaff', 71).activeNow).toBe(true)
  })
  it('över tröskeln: redan aktiv, och värdet klampas vid 100', () => {
    const o = hireOutlook('chiefSalesman', 95)
    expect(o).toMatchObject({ after: 100, activeNow: true, activeAfter: true, hiresToActivate: 0 })
  })
})

describe('HIRE-kortet i THE COMPANY', () => {
  it('visar rollens tröskel, nuvarande värde och vad som händer när tröskeln passeras', () => {
    const state = createInitialState('indochina-slice', 'staff-card-seed')
    state.house.staff.chiefEngineer = 45
    render(<InternalActionsForm state={state} onAddAction={vi.fn()} />)
    const card = screen.getByTestId('company-hire-outlook')
    expect(card.textContent).toContain('45')
    expect(card.textContent).toContain('70')
    expect(card.textContent).toMatch(/above 70/i)
    expect(card.textContent).toMatch(/nothing yet|no effect yet/i)
    expect(card.textContent).toContain(STAFF_ROLES.chiefEngineer.effect)
  })
})
