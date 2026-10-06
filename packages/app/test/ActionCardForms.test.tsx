// @vitest-environment jsdom
// ActionCardForms.test.tsx — P163 (ETAPP10_FORSLAG.md §3b, S3): varje verbformulär i CONTACTS och THE COMPANY visar handlingskortet för sitt verb.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState, officialId } from '@seventh-front/core'
import { ThePolitics } from '../src/components/ThePolitics.js'
import { InternalActionsForm, RawMaterialsPanel } from '../src/components/CompanyActions.js'
import { ACTION_INFO } from '../src/actionInfo.js'

afterEach(cleanup)

describe('CONTACTS — kortet i varje verbformulär', () => {
  const state = () => createInitialState('indochina-slice', 'forms-card-seed')

  it.each(['BRIBE', 'FUND_CAMPAIGN', 'FAVOUR', 'ASSASSINATE'])('%s mot en tjänsteman visar sitt kort, med verbets egen mening', (verb) => {
    const s = state()
    const id = officialId('rvn', 'procurement')
    render(<ThePolitics state={s} onAddAction={() => {}} />)
    fireEvent.click(screen.getByTestId(`contacts-verb-${verb}-${id}`))
    const form = screen.getByTestId(`contacts-form-${verb}-${id}`)
    expect(form.querySelector(`[data-testid="action-card-${verb}"]`)).not.toBeNull()
    expect(form.querySelector('[data-testid="action-card-does"]')!.textContent).toBe(ACTION_INFO[verb]!.does)
  })

  it.each(['STAGE_INCIDENT', 'BACK_CHANNEL', 'FUND_COUP', 'BROKER'])('%s mot ett land visar sitt kort', (verb) => {
    const s = state()
    render(<ThePolitics state={s} onAddAction={() => {}} />)
    fireEvent.click(screen.getByTestId(`contacts-verb-${verb}-rvn`))
    const form = screen.getByTestId(`contacts-form-${verb}-rvn`)
    expect(form.querySelector(`[data-testid="action-card-${verb}"]`)).not.toBeNull()
  })

  it('FUND_COUP: chansen är okänd utan underrättelse och ett tal med den', () => {
    const s = state()
    s.house.staff.chiefSalesman = 0
    for (const st of s.house.stations) st.depth = 0
    const { unmount } = render(<ThePolitics state={s} onAddAction={() => {}} />)
    fireEvent.click(screen.getByTestId('contacts-verb-FUND_COUP-rvn'))
    expect(screen.getByTestId('action-card-chance').textContent).toMatch(/^Unknown/)
    unmount()

    for (const st of s.house.stations) st.depth = 3
    render(<ThePolitics state={s} onAddAction={() => {}} />)
    fireEvent.click(screen.getByTestId('contacts-verb-FUND_COUP-rvn'))
    expect(screen.getByTestId('action-card-chance').textContent).toMatch(/^\d+%$/)
  })

  it('inget formulär nämner en tjänsteman som "she"/"her" längre', () => {
    const s = state()
    render(<ThePolitics state={s} onAddAction={() => {}} />)
    for (const verb of ['BRIBE', 'ASSASSINATE']) fireEvent.click(screen.getByTestId(`contacts-verb-${verb}-${officialId('rvn', 'procurement')}`))
    expect(document.body.textContent).not.toMatch(/\b(she|her)\b/i)
  })
})

describe('THE COMPANY — kortet i varje formulär', () => {
  const state = () => createInitialState('indochina-slice', 'forms-card-company')

  it('lån/återbetalning, linje, anställning och kris-R&D har varsitt kort', () => {
    render(<InternalActionsForm state={state()} onAddAction={() => {}} />)
    for (const verb of ['TAKE_LOAN', 'BUILD_LINE', 'HIRE', 'REPRIORITISE_RND']) {
      expect(screen.getByTestId(`action-card-${verb}`), verb).toBeTruthy()
    }
    fireEvent.click(screen.getByText('REPAY'))
    expect(screen.getByTestId('action-card-REPAY')).toBeTruthy()
  })

  it('råvarupanelen har ett kort som byter mellan RESERVE och RELEASE', () => {
    render(<RawMaterialsPanel state={state()} onAddAction={() => {}} />)
    expect(screen.getByTestId('action-card-BUY_FORWARD')).toBeTruthy()
    fireEvent.click(screen.getByText('RELEASE'))
    expect(screen.getByTestId('action-card-RELEASE')).toBeTruthy()
  })

  it('anställningens kort och tröskelkortet står tillsammans (P162 + P163)', () => {
    render(<InternalActionsForm state={state()} onAddAction={() => {}} />)
    expect(screen.getByTestId('company-hire-outlook')).toBeTruthy()
    expect(screen.getByTestId('action-card-HIRE')).toBeTruthy()
  })
})
