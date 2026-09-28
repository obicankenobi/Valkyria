// PauseOverlay.tsx — P81b (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten, P81-6).
// Första versionen av §5:s "Paus och inställningar: överlager, nåbart
// överallt (Esc)" — bara det P81b:s eget mandat kräver (ljud, tillbaka till
// huvudmenyn, fortsätt). P90 bygger vidare på SAMMA överlag: en ny "Settings"-
// knapp öppnar SettingsOverlay.tsx (ljudnivå, uppspelningsläge, rörelseläge,
// textstorlek, sparplatser, buggrapport) i stället för att svälla det här
// redan minimala panelen — regel 7:s "Högst två rader ... resten bakom
// 'More'"-anda tillämpad på en hel panel, inte bara dess text.
import { Button, DsToggle } from './designSystem.js'

export function PauseOverlay({
  open,
  muted,
  onToggleMuted,
  onResume,
  onMainMenu,
  onOpenSettings,
}: {
  open: boolean
  muted: boolean
  onToggleMuted: () => void
  onResume: () => void
  onMainMenu: () => void
  onOpenSettings: () => void
}) {
  if (!open) return null
  return (
    <div className="pause-overlay" onClick={onResume} data-testid="pause-overlay">
      <div className="pause-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="pause-title">Paused</h2>
        <DsToggle label="Sound" checked={!muted} onChange={onToggleMuted} testId="pause-sound-toggle" />
        <div className="pause-actions">
          <Button variant="primary" onClick={onResume} testId="pause-resume">
            Resume
          </Button>
          <Button variant="secondary" onClick={onOpenSettings} testId="pause-settings">
            Settings
          </Button>
          <Button variant="ghost" onClick={onMainMenu} testId="pause-main-menu">
            Main Menu
          </Button>
        </div>
      </div>
    </div>
  )
}
