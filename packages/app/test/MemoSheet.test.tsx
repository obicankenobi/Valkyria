// MemoSheet.test.tsx — P127 (ETAPP9 §9, "Daterade PM"). Olästa PM visas som rader i kvartalsbandet (utanför antalet), öppnas som ett
// skrivmaskinsblad, och kvitteras med FILE IT eller TAKE ME THERE.
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createInitialState } from '@seventh-front/core'
import { MemoSheet } from '../src/components/MemoSheet.js'
import { QuarterBand } from '../src/components/Shell.js'
import { MEMOS } from '../src/memos.js'

afterEach(cleanup)

describe('daterade PM i kvartalsbandet (P127)', () => {
  it('olästa PM visas som egna rader med en ✉-märkning, och räknas inte in i This Quarter-antalet', () => {
    const state = createInitialState('indochina-slice', 'memo-band')
    const onOpen = vi.fn()
    render(<QuarterBand state={state} onNavigate={() => {}} memos={[MEMOS[0]!]} onOpenMemo={onOpen} />)
    expect(screen.getByTestId('quarterband-memo-count').textContent).toContain('1')
    fireEvent.click(screen.getByTestId('quarterband-toggle'))
    const row = screen.getByTestId('quarterband-memo-drawing-board')
    expect(row.textContent).toContain('12 FEBRUARY 1964')
    expect(row.textContent).toContain('YOUR OWN DESIGNS')
    expect(screen.queryByText('Nothing needs your attention.')).toBeNull()
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith('drawing-board')
  })

  it('utan PM syns ingen märkning', () => {
    const state = createInitialState('indochina-slice', 'memo-band')
    render(<QuarterBand state={state} onNavigate={() => {}} />)
    expect(screen.queryByTestId('quarterband-memo-count')).toBeNull()
  })
})

describe('MemoSheet (P127)', () => {
  it('visar avsändare, datum, ärende och styckena; FILE IT och TAKE ME THERE anropar sina handlare', () => {
    const onFile = vi.fn()
    const onGo = vi.fn()
    render(<MemoSheet memo={MEMOS[2]!} onFile={onFile} onGo={onGo} onClose={() => {}} />)
    const paper = screen.getByTestId('memo-arms-race')
    expect(paper.textContent).toContain('THE ATTACHÉS')
    expect(paper.textContent).toContain('8 JUNE 1965')
    expect(paper.textContent).toContain('THE ARMS RACE BOARD')
    fireEvent.click(screen.getByTestId('memo-file'))
    expect(onFile).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTestId('memo-go'))
    expect(onGo).toHaveBeenCalledTimes(1)
  })

  it('utan PM är arket stängt', () => {
    render(<MemoSheet memo={null} onFile={() => {}} onGo={() => {}} onClose={() => {}} />)
    expect(screen.queryByTestId('memo-sheet')).toBeNull()
  })
})
