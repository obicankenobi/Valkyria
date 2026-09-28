// Handbook.tsx — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): "en
// uppslagsbok i spelet, nåbar från menyn och från varje info-ikon, med ett
// uppslag per mekanik." Samma BottomSheet-mönster som MapLegend.tsx (P81a):
// en lista, `focusId` scrollar och markerar en specifik post direkt (regel
// 13 — samma "öppna direkt på rätt ställe"-princip InfoTooltip:s nya
// onReadMore bygger på).
//
// Regel 7 ("Högst två rader brödtext i en panel. Resten bakom 'More'"):
// bara `summary` visas per rad till att börja med — `body`:s längre stycken
// ligger bakom en egen expanderingsknapp per post, inte hela panelen på en
// gång.
import { useEffect, useRef, useState } from 'react'
import { BottomSheet } from './designSystem.js'
import { HANDBOOK, type HandbookEntry, type HandbookTopicId } from '../handbook.js'

function HandbookRow({ entry, focused }: { entry: HandbookEntry; focused: boolean }) {
  const [expanded, setExpanded] = useState(focused)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focused) setExpanded(true)
    // scrollIntoView saknas i jsdom (samma miljölucka som MapLegend.tsx:s
    // egen LegendRow redan dokumenterar) — utan skyddet kraschar testerna,
    // aldrig i en riktig webbläsare.
    if (focused && typeof ref.current?.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ block: 'center' })
    }
  }, [focused])

  return (
    <div ref={ref} className={focused ? 'handbook-row is-focused' : 'handbook-row'} data-testid={`handbook-row-${entry.id}`}>
      <h3 className="handbook-title">{entry.title}</h3>
      <p className="handbook-summary">{entry.summary}</p>
      {expanded ? (
        <div className="handbook-body" data-testid={`handbook-body-${entry.id}`}>
          {entry.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      ) : (
        <button type="button" className="handbook-more" onClick={() => setExpanded(true)} data-testid={`handbook-more-${entry.id}`}>
          More
        </button>
      )}
    </div>
  )
}

export function Handbook({
  open,
  focusId,
  onClose,
}: {
  open: boolean
  focusId: HandbookTopicId | null
  onClose: () => void
}) {
  return (
    <BottomSheet open={open} title="Handbook" subtitle="One entry per mechanic" onClose={onClose} testId="handbook">
      <div className="handbook-list">
        {HANDBOOK.map((entry) => (
          <HandbookRow key={entry.id} entry={entry} focused={entry.id === focusId} />
        ))}
      </div>
    </BottomSheet>
  )
}
