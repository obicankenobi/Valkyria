// MovementArrow — P41 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.5): en
// ren presentationskomponent för de två rörelsetyper 3B "uppgraderar" till att
// gälla ETT NAMNGIVET förband (REDEPLOY, SUPPLY_ARRIVAL). FRONT_SHIFT/CAPTURE är
// "Oförändrat" per avsnitt 5.5:s egen tabell och ritas inte om här — de hör till
// fronten (redan ritad i TheWorld.tsx:s "Fronts"-panel), inte till förbanden.
//
// Tar INGEN state-ändrande prop — ingen callback, inget event-handtag, ingen
// onClick. Skyddsräcke 1 (avsnitt 7): spelaren kan aldrig, via den här
// komponenten eller någon annan, skicka en handling som rör ett förband. Det är
// P41:s eget klart när, fäst av ett typnivå-test i
// packages/app/test/MovementArrow.test.tsx.
//
// Inte kopplad till någon PRODUKTION av riktig data i den här commiten: REDEPLOY
// har ingen producent alls i simuleringen (ingen mekanik flyttar ett förbands
// sectorId efter uppresning). SUPPLY_ARRIVAL skulle kräva att deliveries.ts:s
// leveransticker bär förbandsnivå-attribution — en ändring av WireEvent.delta,
// som är en del av det hashade sluttillstånd golden.test.ts fryser; ägaren
// tillfrågad, valde att INTE göra den ändringen i den här commiten (se
// docs/ANDRINGSLOGG.md). Komponenten finns och är testad, redo att drivas av
// riktig data en framtida prompt.
export interface MovementArrowProps {
  kind: 'REDEPLOY' | 'SUPPLY_ARRIVAL'
  formationName: string // redan dimmat, t.ex. via formationDisplay — kan vara 'UNKNOWN FORMATION'
  toSectorId: string
  fromSectorId?: string // bara meningsfullt för REDEPLOY
}

export function MovementArrow({ kind, formationName, toSectorId, fromSectorId }: MovementArrowProps) {
  const label =
    kind === 'REDEPLOY'
      ? `${formationName.toUpperCase()} REDEPLOYS${fromSectorId ? ` ${fromSectorId.toUpperCase()} →` : ''} ${toSectorId.toUpperCase()}`
      : `SUPPLY REACHES ${formationName.toUpperCase()} AT ${toSectorId.toUpperCase()}`

  return (
    <span className={`movement-arrow is-${kind.toLowerCase()}`} title={label}>
      <span aria-hidden="true">{kind === 'REDEPLOY' ? '⇒' : '→'}</span>
      <span className="movement-arrow-label">{label}</span>
    </span>
  )
}
