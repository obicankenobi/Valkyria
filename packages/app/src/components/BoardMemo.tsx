// BoardMemo — styrelsens kvartalsrapport (P97, ETAPP8_FORSLAG.md §3.2): "vid varje
// granskningstur visas ett stencilerat PM från THE SYNDICATE i kvartalsuppspelningen. Det
// innehåller prognos mot mål, de tre största posterna och en mening om vad styrelsen vill
// se." Siffrorna kommer ur core:s boardMemo (byggd på boardReviewOutlook/-Requirement, P81c);
// den enda text som skrivs här är meningen, ett fast mönster per läge — ingen ny formel.
import type { BoardMemo as BoardMemoData } from '@seventh-front/core'
import { ledgerItemLabel } from '../ledgerLabels.js'
import { formatMoney } from './ui.js'

export function boardMemoSentence(memo: BoardMemoData): string {
  const next = memo.next
  if (!memo.passed) {
    if (memo.reviewsFailed >= 2) return 'Two failed reviews in a row. The Syndicate is exercising its buy-out.'
    return next
      ? `The Syndicate requires ${formatMoney(next.requiredMoney)} on the book by turn ${next.turn}. A second failed review in a row ends the mandate.`
      : 'The Syndicate will judge the target outright at maturity. Another failure is not an option.'
  }
  return next
    ? `The Syndicate expects the book to reach ${formatMoney(next.requiredMoney)} by turn ${next.turn}.`
    : 'No further reviews. The Syndicate will judge the target outright at maturity.'
}

export function BoardMemo({ memo }: { memo: BoardMemoData }) {
  const gap = memo.bookMoney - memo.requiredMoney
  return (
    <article className="board-memo" data-testid="board-memo" aria-label="Memorandum from the Syndicate">
      <header className="board-memo-head">
        <span className="board-memo-from">THE SYNDICATE</span>
        <span className="board-memo-kind">MEMORANDUM · BOARD REVIEW T{memo.reviewTurn}</span>
        <span
          className={memo.passed ? 'board-memo-stamp is-passed' : 'board-memo-stamp is-failed'}
          data-testid="board-memo-verdict"
        >
          {memo.passed ? 'On track' : 'Behind schedule'}
        </span>
      </header>

      <dl className="board-memo-forecast">
        <div className="board-memo-line">
          <dt>Book (booked revenue + orders)</dt>
          <dd data-testid="board-memo-book">{formatMoney(memo.bookMoney)}</dd>
        </div>
        <div className="board-memo-line">
          <dt>Required at this review</dt>
          <dd data-testid="board-memo-required">{formatMoney(memo.requiredMoney)}</dd>
        </div>
        <div className="board-memo-line">
          <dt>{gap >= 0 ? 'Ahead by' : 'Short by'}</dt>
          <dd className={gap >= 0 ? 'is-ahead' : 'is-short'}>{formatMoney(Math.abs(gap))}</dd>
        </div>
      </dl>

      <div className="board-memo-items">
        <h4 className="board-memo-subhead">Largest items this quarter</h4>
        {memo.topItems.length === 0 ? (
          <p className="board-memo-none">— no ledger entries for this quarter —</p>
        ) : (
          <ol className="board-memo-list">
            {memo.topItems.map((item, index) => (
              <li className="board-memo-line" key={`${item.kind}-${item.row}`} data-testid={`board-memo-item-${index}`}>
                <span>{ledgerItemLabel(item.kind, item.row)}</span>
                <span>
                  {item.kind === 'income' ? '+' : '−'}
                  {formatMoney(item.amount)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="board-memo-sentence" data-testid="board-memo-sentence">
        {boardMemoSentence(memo)}
      </p>
    </article>
  )
}
