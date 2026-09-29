// ProductionLineBand — utbruten ur TheHouse.tsx i P101 så att anslagstavlan (StandingOrdersBoard.tsx)
// visar EXACT samma linjeband på linjekortens framsida: "Linjekorten sitter ihop med
// produktionslinjebanden från P85, så att samma linje inte visas på två ställen med olika sanning"
// (ETAPP8_FORSLAG.md §5.2). Innehållet är oförändrat sedan P85.
import { Tag, Bar } from './ui.js'
import { estimateLineCompletionTurn, getProduct } from '@seventh-front/core'
import type { GameState, ProductionLine } from '@seventh-front/core'

// P85 (ETAPP7_TEKNISK_SPEC.md §13, P81-16): "produktionslinjer som visuella
// band... per linje vilka produkter den kan tillverka, takt per kvartal,
// beläggning mot kapacitet och när pågående kontrakt blir klara." GENUINT
// FYND: en linje kan tillverka VILKEN produkt som helst — den ärver bara
// productId/grade från vilket kontrakt production.ts (steg 2) råkar tilldela
// den (ingen kod begränsar en linje till en fast produktlista, se
// docs/ANDRINGSLOGG.md) — visas därför ärligt som "Any product" i idle-läge,
// i stället för att hitta på en linje-specifik produktlista som inte finns i
// datamodellen. capacityPct är i dagens balans alltid 100 (ingen mekanik
// någonsin ändrar den, se production.ts/applyActions.ts BUILD_LINE) — bandet
// visar den ändå, ärligt statisk, snarare än att fejka en variation som inte
// finns.
export function ProductionLineBand({ state, line }: { state: GameState; line: ProductionLine }) {
  const product = line.productId ? getProduct(line.productId) : null
  const completionTurn = estimateLineCompletionTurn(state, line)
  const running = line.status === 'running'

  return (
    <div className="line-band" data-testid="production-line-band">
      <div className="line-band-head">
        <span className="line-band-id">{line.id.toUpperCase()}</span>
        <span className="line-band-product">{product ? product.name : 'Any product — idle'}</span>
        {line.status === 'running' && <Tag tone="green">Running</Tag>}
        {line.status === 'idle' && <Tag>Idle</Tag>}
        {line.status === 'retooling' && <Tag tone="amber">Retooling</Tag>}
        {line.status === 'blocked' && <Tag tone="red">{line.blockedReason ?? 'Blocked'}</Tag>}
      </div>
      <Bar ratio={running ? line.capacityPct / 100 : 0} tone={running ? 'green' : line.status === 'blocked' ? 'red' : 'neutral'} />
      <div className="line-band-meta">
        <span>{product ? `${product.unitsPerLineTurn.toLocaleString('en-GB')} units/quarter at full capacity` : `${line.capacityPct}% capacity, unassigned`}</span>
        {completionTurn !== null && <span>Completes contract T{completionTurn}</span>}
      </div>
    </div>
  )
}

