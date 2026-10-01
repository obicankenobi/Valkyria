// MemoSheet — P127 (ETAPP9_FORSLAG.md §9, "Daterade PM"). Ett daterat PM som ett skrivmaskinsblad i ett bottenark: avsändare, datum, ärende och
// några stycken (regel 7: högst två rader brödtext per stycke i en panel — här är det ett helt blad, så styckena får stå). "FILE IT" kvitterar PM:et
// (visas aldrig igen); "TAKE ME THERE" kvitterar och öppnar vyn där systemet finns.
import { BottomSheet, Button } from './designSystem.js'
import type { DatedMemo } from '../memos.js'

export function MemoSheet({
  memo,
  onFile,
  onGo,
  onClose,
}: {
  memo: DatedMemo | null
  onFile: () => void
  onGo: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet open={memo !== null} title="Memorandum" subtitle={memo ? `${memo.date}` : undefined} onClose={onClose} testId="memo-sheet">
      {memo && (
        <article className="memo-paper" data-testid={`memo-${memo.id}`}>
          <dl className="memo-head">
            <dt>FROM</dt>
            <dd>{memo.from}</dd>
            <dt>DATE</dt>
            <dd>{memo.date}</dd>
            <dt>RE</dt>
            <dd>{memo.subject}</dd>
          </dl>
          {memo.body.map((paragraph, i) => (
            <p className="memo-body" key={i}>
              {paragraph}
            </p>
          ))}
          <div className="memo-actions">
            <Button variant="primary" onClick={onGo} testId="memo-go">
              TAKE ME THERE
            </Button>
            <Button variant="secondary" onClick={onFile} testId="memo-file">
              FILE IT
            </Button>
          </div>
        </article>
      )}
    </BottomSheet>
  )
}
