// MovementArrow.test.tsx — P51 klart-när: "ett test visar att MovementArrow
// fortfarande inte tar någon state-ändrande prop" (ETAPP3_KRIGET_SOM_MARKNAD_
// TEKNISK_SPEC.md avsnitt 5.5/7). "Fortfarande" i klart-när-texten syftar på att
// komponenten, en gång byggd, aldrig i EN SENARE ändring ska få en callback-prop
// smugglad in — så typkontrollen nedan är den del av testet som faktiskt håller
// över tid (en körtidsrendering kan inte upptäcka en NY, tillagd prop den aldrig
// anropar).
// @vitest-environment jsdom
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MovementArrow } from '../src/components/MovementArrow.js'
import type { MovementArrowProps } from '../src/components/MovementArrow.js'

afterEach(cleanup)

// Sant per fält om värdet är en funktionstyp — det är precis vad en
// "state-ändrande prop" (en callback, ett event-handtag) skulle vara.
type FunctionFlags<T> = { [K in keyof T]-?: T[K] extends (...args: never[]) => unknown ? true : false }

describe('MovementArrow (P51 klart-när, skyddsräcke 1)', () => {
  it('inget fält i MovementArrowProps har en funktionstyp — ingen callback, inget event-handtag', () => {
    // Räknar upp varje fält explicit (inte en generisk "never"-kontroll, som
    // expect-type hanterar illa) — en FRAMTIDA prop måste läggas till här för
    // att typechecka alls, vilket tvingar fram en medveten granskning.
    expectTypeOf<FunctionFlags<MovementArrowProps>>().toEqualTypeOf<{
      kind: false
      formationName: false
      toSectorId: false
      fromSectorId: false
    }>()
  })

  it('renderar en SUPPLY_ARRIVAL-pil med förbandets namn och målsektor synliga', () => {
    const { container } = render(<MovementArrow kind="SUPPLY_ARRIVAL" formationName="UNKNOWN FORMATION" toSectorId="da-nang" />)

    expect(container.textContent).toContain('UNKNOWN FORMATION')
    expect(container.textContent).toContain('DA-NANG')
  })

  it('renderar en REDEPLOY-pil med både från- och tillsektor när fromSectorId ges', () => {
    const { container } = render(
      <MovementArrow kind="REDEPLOY" formationName="9th Division" toSectorId="hue" fromSectorId="cu-chi" />,
    )

    expect(container.textContent).toContain('9TH DIVISION')
    expect(container.textContent).toContain('CU-CHI')
    expect(container.textContent).toContain('HUE')
  })
})
