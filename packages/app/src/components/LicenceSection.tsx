// LicenceSection — P136 (ETAPP9_FORSLAG.md §8b.4/§9). Licenser på en konstruktion, på typbladet: de pågående licenserna (licenstagare,
// förmåga, återkalla) och en ny licens (välj faktion, förhandsvisning av engångsbelopp och royalty). Stående order (`LICENCE`), ingen
// handling, gäller från nästa kvartal. Valideras med samma funktion som ordern tillämpar (exklusivitet och exportlistan syns som orsak).
import { useState } from 'react'
import { LICENCE_TERMS, isExportViolation, validateStandingOrderChange } from '@seventh-front/core'
import type { Design, GameState, StandingOrderChange } from '@seventh-front/core'
import { Button, Segmented } from './designSystem.js'
import { Meter, Tag, formatMoney } from './ui.js'

export function LicenceSection({ state, design, onSet }: { state: GameState; design: Design; onSet: (change: StandingOrderChange) => void }) {
  const factions = Object.values(state.factions)
  const [factionId, setFactionId] = useState<string>(factions[0]?.id ?? '')
  const licences = (state.house.licences ?? []).filter((l) => l.designId === design.id && l.status === 'active')
  const grant: StandingOrderChange = { kind: 'LICENCE', op: 'GRANT', designId: design.id, factionId }
  const validation = validateStandingOrderChange(state, state, grant)
  const violation = validation.ok && isExportViolation(state, design, factionId)
  const nameOf = (id: string) => state.factions[id]?.name ?? id
  return (
    <div className="licence-section" data-testid={`licence-section-${design.id}`}>
      <h4 className="drawing-section">LICENCES</h4>
      {licences.length === 0 && <p className="cf-hint">No licences on this design.</p>}
      {licences.map((l) => (
        <div className="licence-row" key={l.id} data-testid={`licence-${l.id}`}>
          <span>{nameOf(l.factionId)}</span>
          {state.factions[l.factionId]?.embargoed && <Tag tone="red">EMBARGOED</Tag>}
          <Meter value={l.capability} label="Licensee's own capability" />
          <Button variant="secondary" onClick={() => onSet({ kind: 'LICENCE', op: 'REVOKE', licenceId: l.id })} testId={`licence-revoke-${l.id}`}>
            REVOKE
          </Button>
        </div>
      ))}
      {factions.length > 0 && (
        <>
          <div className="cf-field">
            <span className="cf-field-label">LICENSEE</span>
            <Segmented
              options={factions.map((f) => ({ value: f.id, label: f.id.toUpperCase() }))}
              value={factionId}
              onChange={setFactionId}
              testId={`licence-faction-${design.id}`}
            />
            <p className="cf-hint">{nameOf(factionId)}</p>
          </div>
          <p className="cf-hint" data-testid={`licence-preview-${design.id}`}>
            +{formatMoney(LICENCE_TERMS.lumpSum)} now and {formatMoney(LICENCE_TERMS.royaltyPerTurn)} a quarter. The licensee learns to build it itself — an embargoed state{' '}
            {LICENCE_TERMS.embargoGrowthFactor} times as fast — and then becomes a rival on your markets.
          </p>
          {violation && <p className="cf-hint is-warning">Across the bloc line this breaches the export list: doomsday, heat and a paper trail.</p>}
          <Button variant="primary" disabled={!validation.ok} onClick={() => onSet(grant)} testId={`licence-grant-${design.id}`}>
            GRANT A LICENCE
          </Button>
          {!validation.ok && <p className="cf-hint is-warning">{validation.reason}</p>}
        </>
      )}
    </div>
  )
}
