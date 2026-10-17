// RubberStampTool.tsx — Paket G3 (ETAPP 12, 12F): fysiskt trästämpelverktyg.
// När spelaren för muspekaren över signaturfältet följer trästämpelns
// fysiska skugga muspekaren; vid klick slår stämpeln ner i papperet med
// stämpelljud (playSound('stamp')), kompressionsanimation och bläckslitage
// (wearClass ur stampWear.ts). Renderar en riktig <button> så att
// tangentbordsnavigation och alla befintliga tester fungerar rakt av.
import { useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { playSound } from '../sound.js'
import { wearClass } from '../stampWear.js'

export interface RubberStampToolProps {
  label: ReactNode
  stampText?: string
  stampId?: string
  tone?: 'red' | 'green' | 'amber'
  disabled?: boolean
  onStamp: () => void
  testId?: string
}

export function RubberStampTool({
  label,
  stampText = 'SEALED & FILED',
  stampId = 'default-stamp',
  tone = 'red',
  disabled = false,
  onStamp,
  testId,
}: RubberStampToolProps) {
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)
  const [slammedAt, setSlammedAt] = useState<{ x: number; y: number } | null>(null)

  function handleMouseMove(e: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    setCursorPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    if (disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX ? e.clientX - rect.left : rect.width / 2
    const clickY = e.clientY ? e.clientY - rect.top : rect.height / 2
    setSlammedAt({ x: clickX, y: clickY })
    void playSound('stamp')
    onStamp()
  }

  return (
    <button
      type="button"
      className={`ds-button is-primary desk-stamp-pad is-${tone}${slammedAt ? ' is-stamped' : ''}`}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setCursorPos(null)}
      onClick={handleClick}
      data-testid={testId}
    >
      <span className="desk-stamp-pad-frame" aria-hidden="true">
        <span className="desk-stamp-sig-line">SIGNATURE &amp; SEAL</span>
      </span>

      <span className="desk-stamp-btn-label">{label}</span>

      {slammedAt && (
        <span
          className={`desk-stamp-impression is-${tone}${wearClass(stampId)}`}
          style={{ left: `${slammedAt.x}px`, top: `${slammedAt.y}px` }}
          aria-hidden="true"
        >
          {stampText}
        </span>
      )}

      {cursorPos && !disabled && (
        <span
          className="desk-wooden-stamp-cursor"
          style={{ left: `${cursorPos.x}px`, top: `${cursorPos.y}px` }}
          aria-hidden="true"
        >
          <span className="desk-wooden-handle" />
          <span className="desk-wooden-base">{stampText}</span>
        </span>
      )}
    </button>
  )
}
