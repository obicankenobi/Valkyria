// designSheet.test.ts — P126: stämpelns företrädesordning, klassetiketten och projektets framsteg.
import { describe, expect, it } from 'vitest'
import type { Investigation } from '@seventh-front/core'
import { designStamp, openInvestigationsFor, projectProgress, qualityLabel } from '../src/designSheet.js'

const design = (over: Partial<Parameters<typeof designStamp>[0]> = {}) => ({
  id: 'design-1',
  status: 'active' as const,
  fieldRecord: { occasions: 0, proven: false },
  testedIn: [] as never[],
  ...over,
})
const inquiry = (status: Investigation['status'], designId = 'design-1'): Investigation =>
  ({ id: `inv-${status}`, designId, environment: 'monsoon', severity: 2, frontId: 'front-1', buyerId: 'rvn', openedTurn: 3, deadlineTurn: 6, status, causeEventId: null }) as Investigation

describe('designStamp (P126, §9)', () => {
  it('en ny konstruktion är UNTESTED', () => {
    expect(designStamp(design(), [])).toBe('UNTESTED')
    expect(designStamp(design(), undefined)).toBe('UNTESTED')
  })
  it('beprövad i fält ger PROVEN IN THE FIELD', () => {
    expect(designStamp(design({ fieldRecord: { occasions: 3, proven: true } }), [])).toBe('PROVEN IN THE FIELD')
  })
  it('en öppen eller förnekad utredning ger UNDER REVIEW, en avslutad inte', () => {
    expect(designStamp(design(), [inquiry('open')])).toBe('UNDER REVIEW')
    expect(designStamp(design(), [inquiry('denied')])).toBe('UNDER REVIEW')
    expect(designStamp(design(), [inquiry('fixed'), inquiry('exposed')])).toBe('UNTESTED')
    expect(designStamp(design(), [inquiry('open', 'design-2')])).toBe('UNTESTED')
  })
  it('tillbakadragen är RECALLED och går före allt annat', () => {
    expect(designStamp(design({ status: 'withdrawn', fieldRecord: { occasions: 3, proven: true } }), [inquiry('open')])).toBe('RECALLED')
  })
  it('under granskning går före beprövad', () => {
    expect(designStamp(design({ fieldRecord: { occasions: 3, proven: true } }), [inquiry('open')])).toBe('UNDER REVIEW')
  })
  it('openInvestigationsFor ger bara den här konstruktionens pågående utredningar', () => {
    expect(openInvestigationsFor('design-1', [inquiry('open'), inquiry('fixed'), inquiry('open', 'design-2')])).toHaveLength(1)
  })
})

describe('qualityLabel och projectProgress (P126)', () => {
  it('klassen med osäkerhet, eller bara klassen utan', () => {
    expect(qualityLabel({ center: 'B', plusMinus: 1 })).toBe('B ±1')
    expect(qualityLabel({ center: 'A', plusMinus: 0 })).toBe('A')
  })
  it('framsteg är andelen avverkade turer, klampad 0–1', () => {
    expect(projectProgress({ turnsRemaining: 4, turnsTotal: 4 })).toBe(0)
    expect(projectProgress({ turnsRemaining: 1, turnsTotal: 4 })).toBe(0.75)
    expect(projectProgress({ turnsRemaining: 0, turnsTotal: 0 })).toBe(1)
    expect(projectProgress({ turnsRemaining: 9, turnsTotal: 4 })).toBe(0)
  })
})
