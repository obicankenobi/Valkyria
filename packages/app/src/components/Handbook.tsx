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
// Speltest 2026-10-17 (punkt 14 och 15): förut en lång lista där info-knappens uppslag skulle scrollas fram — det hände innan arket glidit in, så
// handboken "öppnade på sida 1", och listan gick inte att navigera. Nu en innehållsförteckning i tre avdelningar till vänster och det valda
// uppslaget i sin helhet till höger; info-knappen väljer sitt uppslag direkt.
import { useEffect, useState } from 'react'
import { BottomSheet } from './designSystem.js'
import { HANDBOOK, type HandbookEntry, type HandbookTopicId } from '../handbook.js'

// Avdelningarna i innehållsförteckningen. Varje uppslag i HANDBOOK står i exakt en (bevakat av Handbook.test.tsx).
export const HANDBOOK_SECTIONS: readonly { label: string; ids: readonly HandbookTopicId[] }[] = [
  { label: 'The trade', ids: ['procurement', 'production', 'works', 'design', 'programmes', 'race'] },
  { label: 'The house', ids: ['board', 'state', 'trail'] },
  { label: 'The world', ids: ['fronts', 'heat', 'doomsday', 'intelligence', 'politics'] },
]

function HandbookEntryView({ entry }: { entry: HandbookEntry }) {
  return (
    <article className="handbook-entry" data-testid={`handbook-entry-${entry.id}`}>
      <h3 className="handbook-title">{entry.title}</h3>
      <p className="handbook-summary">{entry.summary}</p>
      <div className="handbook-body" data-testid={`handbook-body-${entry.id}`}>
        {entry.body.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </article>
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
  const [selected, setSelected] = useState<HandbookTopicId>(focusId ?? HANDBOOK[0]!.id)
  // Varje gång handboken öppnas från en info-knapp visar den just det uppslaget.
  useEffect(() => {
    if (open && focusId) setSelected(focusId)
  }, [open, focusId])
  const entry = HANDBOOK.find((e) => e.id === selected) ?? HANDBOOK[0]!

  return (
    <BottomSheet open={open} title="Handbook" subtitle="One entry per mechanic" onClose={onClose} testId="handbook">
      <div className="handbook-layout">
        <nav className="handbook-index" aria-label="Handbook contents">
          {HANDBOOK_SECTIONS.map((section) => (
            <div key={section.label} className="handbook-index-section">
              <span className="handbook-index-label">{section.label}</span>
              {section.ids.map((id) => {
                const item = HANDBOOK.find((e) => e.id === id)
                if (!item) return null
                return (
                  <button
                    key={id}
                    type="button"
                    className={id === entry.id ? 'handbook-index-item is-selected' : 'handbook-index-item'}
                    aria-current={id === entry.id ? 'page' : undefined}
                    onClick={() => setSelected(id)}
                    data-testid={`handbook-row-${id}`}
                  >
                    {item.title}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
        <HandbookEntryView entry={entry} />
      </div>
    </BottomSheet>
  )
}
