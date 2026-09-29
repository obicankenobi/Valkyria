// BoardMemo.test.tsx — P97 (ETAPP8_FORSLAG.md §3.2): styrelsens PM. Innehåll: prognos mot
// mål, de tre största posterna och EN mening om vad styrelsen vill se. Meningen är ett fast
// mönster per läge (godkänd/underkänd × finns en nästa granskning), inga nya formler.
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { BoardMemo as BoardMemoData } from '@seventh-front/core'
import { BoardMemo, boardMemoSentence } from '../src/components/BoardMemo.js'

afterEach(cleanup)

function memo(patch: Partial<BoardMemoData> = {}): BoardMemoData {
  return {
    reviewTurn: 6,
    current: 0.3,
    required: 0.16,
    bookMoney: 1_200_000,
    requiredMoney: 640_000,
    passed: true,
    reviewsFailed: 0,
    topItems: [
      { kind: 'expense', row: 'fixedCosts', amount: 429_000 },
      { kind: 'expense', row: 'intel', amount: 200_000 },
      { kind: 'income', row: 'contracts', amount: 125_488 },
    ],
    next: { turn: 10, required: 0.45, requiredMoney: 1_800_000 },
    ...patch,
  }
}

describe('boardMemoSentence', () => {
  it('godkänd med en nästa granskning: vad boken ska nå och när', () => {
    expect(boardMemoSentence(memo())).toBe('The Syndicate expects the book to reach £1,800,000 by turn 10.')
  })
  it('underkänd första gången: kravet och att en andra underkänd granskning avslutar mandatet', () => {
    const text = boardMemoSentence(memo({ passed: false, reviewsFailed: 1 }))
    expect(text).toContain('£1,800,000')
    expect(text).toContain('turn 10')
    expect(text).toContain('second failed review')
  })
  it('två underkända i rad: uppköpet', () => {
    expect(boardMemoSentence(memo({ passed: false, reviewsFailed: 2, next: null }))).toContain('buy-out')
  })
  it('sista granskningen avklarad: målet avgörs vid förfall', () => {
    expect(boardMemoSentence(memo({ next: null }))).toContain('No further reviews')
  })
})

describe('BoardMemo', () => {
  it('visar granskningsturen, stämpeln, prognosen mot målet, tre poster och meningen', () => {
    render(<BoardMemo memo={memo()} />)
    expect(screen.getByTestId('board-memo').textContent).toContain('BOARD REVIEW T6')
    expect(screen.getByTestId('board-memo-verdict').textContent).toBe('On track')
    expect(screen.getByTestId('board-memo-book').textContent).toBe('£1,200,000')
    expect(screen.getByTestId('board-memo-required').textContent).toBe('£640,000')
    expect(screen.getByTestId('board-memo-item-0').textContent).toContain('Fixed costs')
    expect(screen.getByTestId('board-memo-item-0').textContent).toContain('−£429,000')
    expect(screen.getByTestId('board-memo-item-2').textContent).toContain('+£125,488')
    expect(screen.queryByTestId('board-memo-item-3')).toBeNull()
    expect(screen.getByTestId('board-memo-sentence').textContent).toContain('£1,800,000')
  })

  it('en underkänd granskning stämplas "Behind schedule" och visar hur mycket som saknas', () => {
    render(<BoardMemo memo={memo({ passed: false, reviewsFailed: 1, bookMoney: 400_000 })} />)
    expect(screen.getByTestId('board-memo-verdict').textContent).toBe('Behind schedule')
    expect(screen.getByTestId('board-memo').textContent).toContain('Short by')
    expect(screen.getByTestId('board-memo').textContent).toContain('£240,000')
  })

  it('utan huvudboksrader (migrerat parti) visas en ärlig rad i stället för poster', () => {
    render(<BoardMemo memo={memo({ topItems: [] })} />)
    expect(screen.getByTestId('board-memo').textContent).toContain('no ledger entries')
  })
})
