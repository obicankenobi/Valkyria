// designSystem — etapp 7:s komponentbibliotek (P73, ETAPP7_TEKNISK_SPEC.md §3/§11.3).
// Egen fil, skild från ui.tsx (som förblir de FYRA BEFINTLIGA vyernas byggstenar,
// oförändrade tills de byggs om skärm för skärm i P76+). Dessa komponenter är vad
// framtida skärmar (7B–7D) byggs av — "Designsystemet först" (§11.3): byggda och
// fotograferade på en egen komponentsida (ComponentLibrary.tsx) innan någon skärm
// sätts ihop av dem.
//
// Genomgående: aldrig en native <select>/input[type=number]/checkbox/radio (regel 2).
// Fyra tillstånd — idle/pressed/selected/disabled, plus hover bara på skrivbord
// (regel 3). Träffytor minst 44×44 px (regel 11). Ingen information bara vid
// hovring — allt som visas vid hovring på skrivbord nås med tryck på mobil (regel 13).
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

// ── Panel — samma ram för alla paneler: rubrikband, hörnmarkeringar, textur ──
// (regel 6). Byggd separat från ui.tsx:s Panel eftersom den befintliga saknar
// hörnmarkeringar och en dedikerad rubrikbandsstil (stämplad, versal, Stardos
// Stencil) — snarare än att bredda ui.tsx:s Panel-props i onödan bryts den ut
// som en egen komponent i det nya systemet.

function CornerMarks() {
  return (
    <>
      <span className="ds-corner ds-corner-tl" aria-hidden="true" />
      <span className="ds-corner ds-corner-tr" aria-hidden="true" />
      <span className="ds-corner ds-corner-bl" aria-hidden="true" />
      <span className="ds-corner ds-corner-br" aria-hidden="true" />
    </>
  )
}

export function DsPanel({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="ds-panel">
      <CornerMarks />
      <div className="ds-panel-head">
        <h3 className="ds-panel-title">{title}</h3>
        {right}
      </div>
      <div className="ds-panel-body">{children}</div>
    </section>
  )
}

// ── Button — bakelitknapp (regel 8). :active ger "pressed" omedelbart (regel 3,
// under 100 ms är webbläsarens egen träfftid, ingen extra JS behövs). ──
export function Button({
  children,
  onClick,
  variant = 'primary',
  selected = false,
  disabled = false,
  ariaLabel,
  testId,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  selected?: boolean
  disabled?: boolean
  ariaLabel?: string
  testId?: string
}) {
  const classes = ['ds-button', `is-${variant}`]
  if (selected) classes.push('is-selected')
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-testid={testId}
    >
      {children}
    </button>
  )
}

// ── IconButton — kvadratisk, en ikon, minst 44×44 (regel 11). ──
export function IconButton({
  icon,
  label,
  onClick,
  selected = false,
  disabled = false,
  testId,
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  selected?: boolean
  disabled?: boolean
  testId?: string
}) {
  const classes = ['ds-icon-button']
  if (selected) classes.push('is-selected')
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      data-testid={testId}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

// ── DsTab — flik med ikon (regel 5: alla flikar har en ikon, text är etikett). ──
export function DsTab({
  icon,
  label,
  active,
  count,
  onClick,
  testId,
}: {
  icon: ReactNode
  label: string
  active: boolean
  count?: number
  onClick?: () => void
  testId?: string
}) {
  const classes = ['ds-tab']
  if (active) classes.push('is-active')
  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      disabled={active}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
    >
      <span className="ds-tab-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="ds-tab-label">{label}</span>
      {count !== undefined && count > 0 && <span className="ds-tab-count">{count}</span>}
    </button>
  )
}

// ── Card — registerkort (regel 8: "Handlingar: registerkort"). ──
export function Card({
  children,
  selected = false,
  onClick,
  testId,
}: {
  children: ReactNode
  selected?: boolean
  onClick?: () => void
  testId?: string
}) {
  const classes = ['ds-card']
  if (selected) classes.push('is-selected')
  if (onClick) classes.push('is-clickable')
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={classes.join(' ')}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Tag>
  )
}

// ── ActionSlot — handlingsplatserna i bottendockan (§7.2): ett kort med ikon,
// mål och kostnad, × för att ångra. Antal platser är house.actionPoints. ──
export function ActionSlot({
  icon,
  label,
  cost,
  onRemove,
  onOpen,
  empty = false,
  testId,
}: {
  icon?: ReactNode
  label?: string
  cost?: string
  onRemove?: () => void
  onOpen?: () => void
  empty?: boolean
  testId?: string
}) {
  if (empty) {
    return (
      <div className="ds-action-slot is-empty" data-testid={testId}>
        <span className="ds-action-slot-plus" aria-hidden="true">
          +
        </span>
      </div>
    )
  }
  return (
    <div className="ds-action-slot" data-testid={testId}>
      <button type="button" className="ds-action-slot-main" onClick={onOpen}>
        <span className="ds-action-slot-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="ds-action-slot-text">
          <span className="ds-action-slot-label">{label}</span>
          {cost && <span className="ds-action-slot-cost">{cost}</span>}
        </span>
      </button>
      {onRemove && (
        <button type="button" className="ds-action-slot-remove" onClick={onRemove} aria-label="Cancel">
          ×
        </button>
      )}
    </div>
  )
}

// ── BottomSheet — valt föremål öppnar ett ark som täcker nedre halvan (§5),
// kan dras upp till helskärm. Här: två höjdlägen (half/full), växlas med ett
// grepphandtag — dra-i-realtid är utanför P73:s scope (bottenarkets EGEN
// skärm byggs i 7B, P79); det här är formen alla framtida bottenark delar. ──
export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  testId,
}: {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  testId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (!open) return null
  return (
    <div className="ds-sheet-overlay" onClick={onClose}>
      <div
        className={expanded ? 'ds-sheet is-expanded' : 'ds-sheet'}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
      >
        <button
          type="button"
          className="ds-sheet-handle"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <span className="ds-sheet-grip" aria-hidden="true" />
        </button>
        <div className="ds-sheet-head">
          <div>
            <h2 className="ds-sheet-title">{title}</h2>
            {subtitle && <p className="ds-sheet-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="ds-sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="ds-sheet-body">{children}</div>
      </div>
    </div>
  )
}

// ── DsSlider — kontinuerligt reglage, greppområde minst 44 px (§7.3). Byggd
// utan <input type="range"> (regel 2) — en div med role="slider" och tangent-
// bordsstöd, styrt av pil vänster/höger. ──
export function DsSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  testId?: string
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  function clamp(next: number): number {
    return Math.min(max, Math.max(min, next))
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(clamp(value + step))
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(clamp(value - step))
    else if (e.key === 'Home') onChange(min)
    else if (e.key === 'End') onChange(max)
  }

  function handlePointer(e: React.PointerEvent<HTMLDivElement>) {
    const track = e.currentTarget
    function update(clientX: number) {
      const rect = track.getBoundingClientRect()
      const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0
      const raw = min + ratio * (max - min)
      const stepped = Math.round(raw / step) * step
      onChange(clamp(stepped))
    }
    update(e.clientX)
    track.setPointerCapture(e.pointerId)
    function onMove(ev: PointerEvent) {
      update(ev.clientX)
    }
    function onUp() {
      track.removeEventListener('pointermove', onMove)
      track.removeEventListener('pointerup', onUp)
    }
    track.addEventListener('pointermove', onMove)
    track.addEventListener('pointerup', onUp)
  }

  return (
    <div className="ds-slider" data-testid={testId}>
      <div className="ds-slider-head">
        <span className="ds-slider-label">{label}</span>
        <span className="ds-slider-value">{format ? format(value) : value}</span>
      </div>
      <div className="ds-slider-track" onPointerDown={handlePointer}>
        <div className="ds-slider-fill" style={{ width: `${pct}%` }} />
        <div
          className="ds-slider-thumb"
          style={{ left: `${pct}%` }}
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  )
}

// ── Stepper — +/- knappar, för finjustering ovanpå TierPicker (§7.3). ──
export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
  testId,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
  testId?: string
}) {
  return (
    <div className="ds-stepper" data-testid={testId}>
      <span className="ds-stepper-label">{label}</span>
      <div className="ds-stepper-controls">
        <button
          type="button"
          className="ds-stepper-btn"
          onClick={() => onChange(Math.max(min, value - step))}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <span className="ds-stepper-value">{format ? format(value) : value}</span>
        <button
          type="button"
          className="ds-stepper-btn"
          onClick={() => onChange(Math.min(max, value + step))}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

// ── Segmented — flera alternativ, ett valt (t.ex. Effect: Public support / Relations). ──
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testId,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  testId?: string
}) {
  return (
    <div className="ds-segmented" role="radiogroup" data-testid={testId}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          className={opt.value === value ? 'ds-segmented-opt is-selected' : 'ds-segmented-opt'}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── TierPicker — tre nivåer (Modest/Serious/Lavish), §7.3. Beloppen är
// balansdata i den riktiga skärmen; komponenten tar dem som props. ──
export interface Tier {
  key: 'modest' | 'serious' | 'lavish'
  label: string
  amount: string
  effect?: string
}

export function TierPicker({
  tiers,
  value,
  onChange,
  testId,
}: {
  tiers: Tier[]
  value: Tier['key']
  onChange: (key: Tier['key']) => void
  testId?: string
}) {
  return (
    <div className="ds-tierpicker" role="radiogroup" data-testid={testId}>
      {tiers.map((tier) => (
        <button
          key={tier.key}
          type="button"
          role="radio"
          aria-checked={tier.key === value}
          className={tier.key === value ? 'ds-tier is-selected' : 'ds-tier'}
          onClick={() => onChange(tier.key)}
        >
          <span className="ds-tier-label">{tier.label}</span>
          <span className="ds-tier-amount">{tier.amount}</span>
          {tier.effect && <span className="ds-tier-effect">{tier.effect}</span>}
        </button>
      ))}
    </div>
  )
}

// ── DsToggle — av/på (regel 2: aldrig en native checkbox). ──
export function DsToggle({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  testId?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? 'ds-toggle is-on' : 'ds-toggle'}
      onClick={() => onChange(!checked)}
      data-testid={testId}
    >
      <span className="ds-toggle-label">{label}</span>
      <span className="ds-toggle-track" aria-hidden="true">
        <span className="ds-toggle-knob" />
      </span>
    </button>
  )
}

// ── InfoTooltip — förklaring bakom en info-ikon (§9 "Handledning"): tryck på
// mobil, tryck ELLER hovring på skrivbord (regel 13 — hovring är aldrig den
// ENDA vägen in). ──
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span className="ds-tooltip">
      <button
        type="button"
        className="ds-tooltip-trigger"
        aria-label="More information"
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {open && (
        <span className="ds-tooltip-bubble" role="tooltip" id={id}>
          {text}
        </span>
      )}
    </span>
  )
}

// ── FormationToken — förbandsbricka, APP-6-stil (§6.4). Formen visar SIDA
// (rektangel=vänlig, romb=fientlig, kvadrat=neutral) så kartan fungerar för
// färgblinda, inte bara färgen. `unknown` (utan station, skyddsräcke 3) ritas
// streckad utan doktrin/styrka. ──
export function FormationToken({
  side,
  doctrine,
  strengthDots,
  status = 'active',
  unknown = false,
  testId,
}: {
  side: 'a' | 'b' | 'neutral'
  doctrine?: string
  strengthDots?: number
  status?: 'active' | 'mauled' | 'refitting'
  unknown?: boolean
  testId?: string
}) {
  const classes = ['ds-token', `is-side-${side}`, `is-status-${status}`]
  if (unknown) classes.push('is-unknown')
  const shape = side === 'a' ? 'rect' : side === 'b' ? 'diamond' : 'square'
  return (
    <span className={classes.join(' ')} data-testid={testId}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        {shape === 'rect' && (
          <rect
            x="3"
            y="6"
            width="22"
            height="16"
            className="ds-token-shape"
            strokeDasharray={unknown ? '3 2' : undefined}
          />
        )}
        {shape === 'diamond' && (
          <rect
            x="6.5"
            y="6.5"
            width="15"
            height="15"
            className="ds-token-shape"
            transform="rotate(45 14 14)"
            strokeDasharray={unknown ? '3 2' : undefined}
          />
        )}
        {shape === 'square' && (
          <rect
            x="5"
            y="5"
            width="18"
            height="18"
            className="ds-token-shape"
            strokeDasharray={unknown ? '3 2' : undefined}
          />
        )}
        {!unknown && doctrine && (
          <text x="14" y="17" textAnchor="middle" className="ds-token-letter">
            {doctrine[0]?.toUpperCase()}
          </text>
        )}
        {unknown && (
          <text x="14" y="17" textAnchor="middle" className="ds-token-letter">
            ?
          </text>
        )}
      </svg>
      {!unknown && strengthDots !== undefined && (
        <span className="ds-token-dots" aria-hidden="true">
          {Array.from({ length: Math.min(3, Math.max(0, strengthDots)) }, (_, i) => (
            <span key={i} className="ds-token-dot" />
          ))}
        </span>
      )}
    </span>
  )
}
