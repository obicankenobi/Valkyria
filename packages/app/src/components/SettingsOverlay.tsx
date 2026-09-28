// SettingsOverlay — P90 (ETAPP7_TEKNISK_SPEC.md §9/§13, *utökad efter P81
// (P81-6)*): "bygger vidare på P81b:s överlag" (PauseOverlay.tsx). Reached
// via a new "Settings" button in PauseOverlay — kept as a SEPARATE overlay
// rather than folded into PauseOverlay itself, so the small Resume/Main Menu
// panel stays uncluttered (regel 7: "Högst två rader brödtext i en panel.
// Resten bakom 'More'" — the same instinct applied to a whole panel's worth
// of settings, not just its text).
//
// Scope decisions, all genuine findings from reading the actual code before
// building (genomgående krav 8), not guesses:
//
// - "Ljudnivå per kanal": no channel concept exists anywhere (sound.ts has
//   three undifferentiated one-shot effects, no music/voice/SFX layers, and
//   no gain control at all before this prompt). Built instead: ONE global
//   volume (0-100%, sound.ts's new setVolume/GainNode) — the honest superset
//   of what already existed, not an invented taxonomy.
// - "Animationshastighet" + "reducerad rörelse": unified into a single
//   Motion control (Normal/Fast/Off) rather than two separate settings — no
//   shared duration token exists to scale individual rules precisely, but
//   the SAME universal-selector technique the existing
//   `@media (prefers-reduced-motion: reduce) { * { ... } }` rule already
//   uses (styles.css) generalises cleanly to a fast/off override, covering
//   every transition/animation uniformly rather than a hand-picked subset.
// - "Textstorlek": styles.css declares sizes in literal px throughout (regel
//   14 itself specifies literal px floors) — a true global rescale would
//   mean converting the whole stylesheet to relative units, far beyond this
//   prompt. Built instead: a Normal/Large toggle scoped to the highest-
//   traffic BODY TEXT classes (styles.css's new [data-text-scale="large"]
//   rules) — documented partial coverage, not an exhaustive rescale.
// - "Sparplatser": useGame.ts autosaves continuously to ONE slot (SAVE_SLOT)
//   — turning every slot into its own independently-autosaved, resumable
//   game would mean rearchitecting that assumption, out of scope for one
//   prompt. Built instead: three NAMED MANUAL CHECKPOINTS layered on top of
//   the existing autosave (persistence.ts's saveGame/loadGame/deleteSave
//   already take an arbitrary slot string — only deleteSave was missing).
import { useEffect, useState } from 'react'
import type { GameState, TurnSubmission, WireEvent } from '@seventh-front/core'
import { Button, DsSlider, DsToggle, Segmented } from './designSystem.js'
import type { MotionSetting, SavedGame, TextScaleSetting } from '../persistence.js'
import { deleteSave, loadGame, saveGame } from '../persistence.js'
import { MANUAL_SLOTS } from '../game.js'
import { APP_VERSION } from '../version.js'

const ISSUE_TRACKER_URL = 'https://github.com/obicankenobi/Valkyria/issues/new'

const SLOT_LABEL: Record<string, string> = {
  'manual-1': 'Checkpoint 1',
  'manual-2': 'Checkpoint 2',
  'manual-3': 'Checkpoint 3',
}

function describeSlot(saved: SavedGame | null): string {
  if (!saved) return 'Empty'
  return `${saved.state.house.name} — Turn ${saved.state.meta.turn}`
}

function buildBugReport(state: GameState, recentEvents: readonly WireEvent[]): string {
  const lines = [
    `The Seventh Front — Bug Report`,
    `Version: ${APP_VERSION}`,
    `House: ${state.house.name}`,
    `Turn: ${state.meta.turn} (${state.meta.year} Q${state.meta.quarter})`,
    `Scenario: ${state.meta.scenarioId}`,
    `Status: ${state.status.kind}`,
    '',
    'Recent events this quarter:',
    ...(recentEvents.length === 0 ? ['(none)'] : recentEvents.map((e) => `- ${e.headline}`)),
  ]
  return lines.join('\n')
}

type PendingConfirm = { kind: 'save' | 'load' | 'delete'; slot: string }

export function SettingsOverlay({
  open,
  onClose,
  muted,
  onToggleMuted,
  volume,
  onVolumeChange,
  fullReplay,
  onToggleFullReplay,
  motion,
  onMotionChange,
  textScale,
  onTextScaleChange,
  state,
  draft,
  recentEvents,
  onLoadFromSlot,
}: {
  open: boolean
  onClose: () => void
  muted: boolean
  onToggleMuted: () => void
  volume: number // 0..1
  onVolumeChange: (value: number) => void
  fullReplay: boolean
  onToggleFullReplay: (value: boolean) => void
  motion: MotionSetting
  onMotionChange: (value: MotionSetting) => void
  textScale: TextScaleSetting
  onTextScaleChange: (value: TextScaleSetting) => void
  state: GameState
  draft: TurnSubmission
  recentEvents: readonly WireEvent[]
  onLoadFromSlot: (slot: string) => Promise<boolean>
}) {
  const [slots, setSlots] = useState<Record<string, SavedGame | null>>({})
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null)
  const [reportCopied, setReportCopied] = useState(false)

  // Läs alla tre flikars status varje gång panelen öppnas — de kan ha
  // ändrats sedan förra visningen (spara/ladda/radera i en annan session är
  // inte något appen behöver bevaka LIVE, bara vid nästa öppning).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all(MANUAL_SLOTS.map((slot) => loadGame(slot).then((saved) => [slot, saved] as const)))
      .then((entries) => {
        if (cancelled) return
        setSlots(Object.fromEntries(entries))
      })
      .catch(() => {
        // IndexedDB otillgängligt — samma gräns som resten av persistence.ts:s
        // anropsplatser: visas som tomma flikar i stället för ett fel.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  async function refreshSlot(slot: string) {
    const saved = await loadGame(slot).catch(() => null)
    setSlots((prev) => ({ ...prev, [slot]: saved }))
  }

  async function handleConfirm() {
    if (!confirm) return
    const { kind, slot } = confirm
    setConfirm(null)
    if (kind === 'save') {
      await saveGame(slot, { state, draft }).catch(() => {})
      await refreshSlot(slot)
    } else if (kind === 'delete') {
      await deleteSave(slot).catch(() => {})
      await refreshSlot(slot)
    } else {
      await onLoadFromSlot(slot)
      onClose() // det laddade partiet ska synas direkt, inte bakom panelen
    }
  }

  return (
    <div className="settings-overlay" onClick={onClose} data-testid="settings-overlay">
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2 className="pause-title">Settings</h2>
          <button type="button" className="ds-sheet-close" onClick={onClose} aria-label="Close" data-testid="settings-close">
            ×
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3 className="settings-section-title">Sound</h3>
            <DsToggle label="Sound" checked={!muted} onChange={onToggleMuted} testId="settings-sound-toggle" />
            <DsSlider
              label="Volume"
              value={Math.round(volume * 100)}
              min={0}
              max={100}
              step={5}
              onChange={(v) => onVolumeChange(v / 100)}
              format={(v) => `${v}%`}
              testId="settings-volume"
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Playback</h3>
            <DsToggle
              label="Full quarter playback"
              checked={fullReplay}
              onChange={() => onToggleFullReplay(!fullReplay)}
              testId="settings-full-replay-toggle"
            />
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Display</h3>
            <div className="settings-field">
              <span className="settings-field-label">Motion</span>
              <Segmented
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'fast', label: 'Fast' },
                  { value: 'off', label: 'Off' },
                ]}
                value={motion}
                onChange={onMotionChange}
                testId="settings-motion"
              />
            </div>
            <div className="settings-field">
              <span className="settings-field-label">Text size</span>
              <Segmented
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'large', label: 'Large' },
                ]}
                value={textScale}
                onChange={onTextScaleChange}
                testId="settings-text-scale"
              />
            </div>
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Save Slots</h3>
            {MANUAL_SLOTS.map((slot) => (
              <div className="settings-slot-row" key={slot} data-testid={`settings-slot-${slot}`}>
                <div className="settings-slot-info">
                  <span className="settings-slot-label">{SLOT_LABEL[slot] ?? slot}</span>
                  <span className="settings-slot-status">{describeSlot(slots[slot] ?? null)}</span>
                </div>
                <div className="settings-slot-actions">
                  <Button variant="ghost" onClick={() => setConfirm({ kind: 'save', slot })} testId={`settings-slot-save-${slot}`}>
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!slots[slot]}
                    onClick={() => setConfirm({ kind: 'load', slot })}
                    testId={`settings-slot-load-${slot}`}
                  >
                    Load
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!slots[slot]}
                    onClick={() => setConfirm({ kind: 'delete', slot })}
                    testId={`settings-slot-delete-${slot}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </section>

          <section className="settings-section">
            <h3 className="settings-section-title">Support</h3>
            <p className="cf-hint">Copies your house, turn, and this quarter's events to the clipboard. No data leaves your device.</p>
            <div className="setup-actions">
              <Button
                variant="ghost"
                onClick={async () => {
                  const report = buildBugReport(state, recentEvents)
                  try {
                    await navigator.clipboard.writeText(report)
                    setReportCopied(true)
                  } catch {
                    // Urklipp otillgängligt (t.ex. utan HTTPS eller behörighet) —
                    // ingen synlig bekräftelse, men aldrig en krasch.
                  }
                }}
                testId="settings-copy-bug-report"
              >
                {reportCopied ? 'Copied' : 'Copy Bug Report'}
              </Button>
              <a
                href={ISSUE_TRACKER_URL}
                target="_blank"
                rel="noreferrer"
                className="ds-button is-secondary"
                data-testid="settings-issue-tracker-link"
              >
                Report an Issue
              </a>
            </div>
          </section>
        </div>
      </div>

      {confirm && (
        // Nästlad inuti .settings-overlay:s egen onClick={onClose} (ovan) —
        // stopPropagation krävs HÄR (till skillnad från MainMenu.tsx:s
        // fristående bekräftelsedialog, som inte har någon yttre klick-
        // hanterare att bubbla upp till), annars stänger ett tryck på
        // Confirm/Cancel HELA inställningspanelen som en oavsiktlig
        // bieffekt av att klicket bubblar vidare till bakgrunden.
        <div className="modal-overlay" data-testid="settings-confirm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-panel">
            <h2 className="view-title">
              {confirm.kind === 'save' && 'Overwrite this checkpoint?'}
              {confirm.kind === 'load' && 'Load this checkpoint?'}
              {confirm.kind === 'delete' && 'Delete this checkpoint?'}
            </h2>
            <p className="banner-sub">
              {confirm.kind === 'save' && 'This replaces whatever was saved in this slot.'}
              {confirm.kind === 'load' && "This replaces your current game with this checkpoint's."}
              {confirm.kind === 'delete' && 'This cannot be undone.'}
            </p>
            <div className="crisis-choices">
              <button type="button" className="btn btn-primary" onClick={handleConfirm} data-testid="settings-confirm-yes">
                Confirm
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)} data-testid="settings-confirm-cancel">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
