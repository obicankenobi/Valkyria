// DeskWorkspace.tsx — Paket G1 (ETAPP 12, 12A/12B): det diegetiska PC-krigsrummet
// i Radio General-stil. Ersätter det gamla mobil-först-skalet med ett fysiskt
// mahognyskrivbord där kartan alltid ligger fastnålad på vänstra bordshalvan
// och arbetsmapparna (Contracts, Company/Works, Contacts/Dossiers, News/Wire
// samt CountryFile) ligger som fysiska manillamappar på den högra bordshalvan.
import { useState } from 'react'
import type { ReactNode } from 'react'
import { boardReviewOutlook, DISPLAY_THRESHOLDS, getProduct } from '@seventh-front/core'
import type { FactionId, GameState, PlayerAction } from '@seventh-front/core'
import { actionSummary, DoomsdayGauge, TABS } from './Shell.js'
import type { ShellView } from './Shell.js'
import { ActionSlot, InfoTooltip } from './designSystem.js'
import { formatMoney } from './ui.js'
import { HANDBOOK, hudNumberTopic } from '../handbook.js'
import type { HandbookTopicId } from '../handbook.js'
import { deriveQuarterlyNotice, deriveThisQuarter } from '../thisQuarter.js'
import type { ThisQuarterTarget } from '../thisQuarter.js'
import type { DatedMemo } from '../memos.js'
import { useDeskYarn, yarnTargetForAction, yarnTargetForOrder, yarnTargetForThisQuarter } from '../deskYarnContext.js'

function hudSummary(id: Parameters<typeof hudNumberTopic>[0]): string {
  const topic = hudNumberTopic(id)
  return HANDBOOK.find((entry) => entry.id === topic)?.summary ?? ''
}

function doomsdayTone(value: number): string {
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisEvent) return 'is-danger'
  if (value >= DISPLAY_THRESHOLDS.doomsdayCrisisWatch) return 'is-amber'
  return ''
}

function splitFlapDigits(amount: number): { sign: string; digits: string[]; suffix: string } {
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount)
  if (abs >= 1_000_000) {
    const m = (abs / 1_000_000).toFixed(2)
    return { sign, digits: m.split(''), suffix: 'M' }
  }
  const k = Math.round(abs / 1_000).toString().padStart(3, '0')
  return { sign, digits: k.split(''), suffix: 'K' }
}

function TheatreOperationsBrief({
  state,
  onSelectCountry,
  onSelectView,
}: {
  state: GameState
  onSelectCountry: (factionId: FactionId) => void
  onSelectView: (view: ShellView) => void
}) {
  const { connectYarn, clearYarn } = useDeskYarn()
  const fronts = Object.values(state.fronts)
  const openOrders = state.market.openOrders

  return (
    <div className="desk-ops-brief" data-testid="desk-operations-brief">
      <div className="desk-folder-header">
        <div>
          <span className="desk-kicker">OPERATIONAL SITUATION SUMMARY · HOVER ANY CARD TO TRACE ON MAP</span>
          <h2 className="desk-folder-title">INDOCHINA &amp; LAOS THEATRES</h2>
        </div>
        <span className="desk-rubber-stamp is-amber">
          {state.meta.year} · Q{state.meta.quarter}
        </span>
      </div>

      <div className="desk-section-label">ACTIVE FRONTS &amp; FORMATIONS</div>
      <div className="desk-card-list">
        {fronts.map((front) => {
          const theatre = state.theatres[front.theatreId]
          const sideA = state.factions[front.sideA]
          const sideB = state.factions[front.sideB]
          const mauledCount = front.formations.filter((f) => f.status === 'mauled').length
          return (
            <div
              key={front.id}
              className="desk-index-card is-interactive"
              onMouseEnter={(e) => connectYarn(e.currentTarget, front.id, 'red')}
              onMouseLeave={clearYarn}
              onClick={() => onSelectCountry(front.sideA)}
              data-testid={`desk-front-card-${front.id}`}
            >
              <div className="desk-card-top">
                <span className="desk-mono-label">
                  {theatre?.name ?? front.theatreId.toUpperCase()} · HEAT {Math.round(theatre?.heat ?? 0)}/100
                </span>
                <span className={`desk-rubber-stamp ${front.status === 'war' ? 'is-red' : 'is-green'}`}>
                  {front.status.toUpperCase()}
                </span>
              </div>
              <div className="desk-card-main">
                <strong>
                  {sideA?.name ?? front.sideA} vs. {sideB?.name ?? front.sideB}
                </strong>
                <span className="desk-mono-val">Pos {front.position > 0 ? `+${front.position}` : front.position}</span>
              </div>
              <div className="desk-card-sub">
                Strength {Math.round(front.strength.a)} : {Math.round(front.strength.b)}
                {mauledCount > 0 ? ` · ${mauledCount} formation${mauledCount === 1 ? '' : 's'} MAULED` : ' · All formations intact'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="desk-section-label">BUYER CAPITAL FILES (CLICK TO OPEN COUNTRY DOSSIER)</div>
      <div className="desk-buyer-grid">
        {Object.values(state.factions).map((faction) => {
          const station = state.house.stations.find((s) => s.nation === faction.id && s.status === 'active')
          const ordersHere = openOrders.filter((o) => o.buyerId === faction.id).length
          return (
            <button
              key={faction.id}
              type="button"
              className="desk-buyer-card"
              onMouseEnter={(e) => connectYarn(e.currentTarget, faction.id, 'amber')}
              onMouseLeave={clearYarn}
              onClick={() => onSelectCountry(faction.id)}
              data-testid={`desk-open-country-${faction.id}`}
            >
              <div className="desk-card-top">
                <strong>{faction.name}</strong>
                {faction.embargoed && <span className="desk-rubber-stamp is-red">EMBARGO</span>}
              </div>
              <div className="desk-card-sub">
                Relation {Math.round(faction.relationToPlayer)}/100 · {station ? `${station.city} D${station.depth}` : 'No Station'}
              </div>
              <div className="desk-mono-label" style={{ color: 'var(--amber-ink)', marginTop: 4 }}>
                {ordersHere} Open Tender{ordersHere === 1 ? '' : 's'} ▸
              </div>
            </button>
          )
        })}
      </div>

      {openOrders.length > 0 && (
        <>
          <div className="desk-section-label">URGENT PROCUREMENT TENDERS ({openOrders.length})</div>
          <div className="desk-card-list">
            {openOrders.slice(0, 3).map((order) => {
              const product = getProduct(order.productId)
              const buyer = state.factions[order.buyerId]
              return (
                <div
                  key={order.id}
                  className="desk-index-card is-interactive"
                  onMouseEnter={(e) => connectYarn(e.currentTarget, yarnTargetForOrder(order, state), 'amber')}
                  onMouseLeave={clearYarn}
                  onClick={() => onSelectView('contracts')}
                >
                  <div className="desk-card-main">
                    <strong>
                      {order.quantity}× {product.name}
                    </strong>
                    <span className="desk-mono-val">{formatMoney(order.statedBudget)}</span>
                  </div>
                  <div className="desk-card-sub">
                    Buyer: {buyer?.name ?? order.buyerId} · Click to open Contracts folder ▸
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export interface DeskWorkspaceProps {
  state: GameState
  activeView: ShellView
  onSelectView: (view: ShellView) => void
  selectedFactionId: FactionId | null
  onSelectCountry: (factionId: FactionId | null) => void
  actions: PlayerAction[]
  onRemoveAction: (index: number) => void
  onOpenCatalog: () => void
  onEndTurn: () => void
  ended: boolean
  memos: readonly DatedMemo[]
  onOpenMemo: (id: string) => void
  onNavigateQuarterItem: (target: ThisQuarterTarget) => void
  onOpenMenu: () => void
  onOpenHandbook: (topic: HandbookTopicId) => void
  mapSlot: ReactNode
  countryFileSlot: ReactNode | null
  folderContentSlot: ReactNode
  bannerSlot?: ReactNode
}

export function DeskWorkspace({
  state,
  activeView,
  onSelectView,
  onSelectCountry,
  actions,
  onRemoveAction,
  onOpenCatalog,
  onEndTurn,
  ended,
  memos,
  onOpenMemo,
  onNavigateQuarterItem,
  onOpenMenu,
  onOpenHandbook,
  mapSlot,
  countryFileSlot,
  folderContentSlot,
  bannerSlot,
}: DeskWorkspaceProps) {
  const [hudExpanded, setHudExpanded] = useState(false)
  const [quarterExpanded, setQuarterExpanded] = useState(true)
  const [lowLamp, setLowLamp] = useState(false)
  const { connectYarn, clearYarn } = useDeskYarn()

  const target = state.house.boardTarget
  const progressPct = target.threshold > 0 ? (target.progressSnapshot / target.threshold) * 100 : 0
  const outlook = boardReviewOutlook(state)
  const boardWarning = outlook.isLastTurnBeforeReview
  const requiredPct = target.threshold > 0 ? (outlook.required / target.threshold) * 100 : 0
  const currentPct = target.threshold > 0 ? (outlook.current / target.threshold) * 100 : 0

  const quarterItems = deriveThisQuarter(state)
  const quarterNotices = deriveQuarterlyNotice(state)
  const quarterCount = quarterItems.length + (boardWarning ? 1 : 0)

  const flap = splitFlapDigits(state.house.treasury)
  const slotsCount = Math.max(state.house.actionPoints, actions.length)

  const headlines = [...state.wire].sort((a, b) => b.turn - a.turn).slice(0, 10)

  return (
    <div className={lowLamp ? 'desk-war-room is-low-lamp' : 'desk-war-room'} data-testid="desk-workspace">
      <div className="desk-lamp-vignette" aria-hidden="true" />

      <section className="desk-left-column">
        <header className="desk-top-bar ds-hud" data-testid="hud">
          <div className="desk-steel-cluster">
            <span className="desk-screw is-tl" aria-hidden="true" />
            <span className="desk-screw is-tr" aria-hidden="true" />
            <span className="desk-screw is-bl" aria-hidden="true" />
            <span className="desk-screw is-br" aria-hidden="true" />

            <button
              type="button"
              className="ds-hud-row desk-hud-main-btn"
              onClick={() => setHudExpanded((v) => !v)}
              aria-expanded={hudExpanded}
              aria-label="Show full status"
            >
              <span className="ds-hud-cell ds-hud-cell-doomsday">
                <DoomsdayGauge value={state.doomsday} />
                <span className={`ds-hud-value ${doomsdayTone(state.doomsday)}`} data-testid="hud-doomsday">
                  {state.doomsday.toFixed(0)}
                </span>
                <span className="ds-hud-label">Doomsday</span>
              </span>

              <span className="ds-hud-cell">
                <span className="desk-odo-housing" aria-hidden="true">
                  <span className="desk-odo-currency">{flap.sign}£</span>
                  {flap.digits.map((ch, idx) => (
                    <span key={idx} className="desk-odo-wheel">
                      {ch}
                    </span>
                  ))}
                  <span className="desk-odo-currency">{flap.suffix}</span>
                </span>
                <span
                  className={state.house.treasury < 0 ? 'ds-hud-value is-danger desk-sr-value' : 'ds-hud-value desk-sr-value'}
                  data-testid="hud-treasury"
                >
                  {formatMoney(state.house.treasury)}
                </span>
                <span className="ds-hud-label">Treasury</span>
              </span>

              <span className="ds-hud-cell ds-hud-cell-board">
                <span className="desk-board-lamp-row">
                  <span className={outlook.isLastTurnBeforeReview ? 'desk-lamp is-danger' : 'desk-lamp'} aria-hidden="true" />
                  <span className="ds-hud-bar">
                    <span className="ds-hud-bar-fill" style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }} />
                  </span>
                </span>
                <span
                  className={outlook.isLastTurnBeforeReview ? 'ds-hud-label is-danger' : 'ds-hud-label'}
                  data-testid="hud-board-outlook"
                >
                  Bd {progressPct.toFixed(0)}% {outlook.turnsUntil !== null ? `· ${outlook.turnsUntil}t` : ''}
                </span>
              </span>

              <span className="ds-hud-cell ds-hud-cell-date">
                <span className="ds-hud-value" data-testid="datestamp">
                  {state.meta.year} · Q{state.meta.quarter}
                </span>
                <span className="ds-hud-label">Turn {state.meta.turn}</span>
              </span>
            </button>

            <button
              type="button"
              className="ds-hud-menu-button"
              onClick={onOpenMenu}
              aria-label="Menu"
              data-testid="hud-menu-button"
            >
              ☰
            </button>
          </div>

          <div className="desk-gadgets-cluster">
            <button
              type="button"
              className={state.pendingCrisis ? 'desk-gadget-btn is-ringing' : 'desk-gadget-btn'}
              onClick={() => onSelectView(state.pendingCrisis ? 'news' : 'contacts')}
              aria-label="Red Line Telephone"
              title="Direct Red Line — Opens Crisis or Dossiers"
            >
              <svg width="26" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6c2-2 14-2 16 0l1 3-4 1-1-2h-8l-1 2-4-1 1-3z" />
                <path d="M6 12h12l2 8H4l2-8z" />
                <circle cx="12" cy="16" r="2.2" />
              </svg>
              <span className="desk-dymo">{state.pendingCrisis ? 'CRISIS LINE' : 'RED LINE'}</span>
            </button>

            <button
              type="button"
              className="desk-gadget-btn is-lamp"
              onClick={() => setLowLamp((v) => !v)}
              aria-label="Toggle desk lamp brightness"
              title="Toggle Brass Desk Lamp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f2b441" strokeWidth="1.8">
                <path d="M6 9l6-5 6 5H6z" />
                <path d="M12 9v9M8 18h8" />
              </svg>
              <span className="desk-dymo">{lowLamp ? 'LAMP: LOW' : 'LAMP: HI'}</span>
            </button>
          </div>

          {hudExpanded && (
            <div className="ds-hud-expanded desk-hud-expanded-overlay" data-testid="hud-expanded">
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Doomsday
                  <InfoTooltip
                    text={hudSummary('doomsday')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('doomsday'))}
                    testId="hud-info-doomsday"
                  />
                </span>
                <span className="ds-hud-value">{state.doomsday.toFixed(0)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Treasury
                  <InfoTooltip
                    text={hudSummary('treasury')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('treasury'))}
                    testId="hud-info-treasury"
                  />
                </span>
                <span className="ds-hud-value">{formatMoney(state.house.treasury)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Board target
                  <InfoTooltip
                    text={hudSummary('board')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('board'))}
                    testId="hud-info-board"
                  />
                </span>
                <span className="ds-hud-value">{progressPct.toFixed(0)}%</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Debt
                  <InfoTooltip
                    text={hudSummary('debt')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('debt'))}
                    testId="hud-info-debt"
                  />
                </span>
                <span className="ds-hud-value">{formatMoney(state.house.debt)}</span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Credit limit
                  <InfoTooltip
                    text={hudSummary('creditLimit')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('creditLimit'))}
                    testId="hud-info-credit-limit"
                  />
                </span>
                <span className="ds-hud-value" data-testid="credit-limit">
                  {formatMoney(state.house.creditLimit)}
                </span>
              </span>
              <span className="ds-hud-expanded-cell">
                <span className="ds-hud-label">
                  Action points
                  <InfoTooltip
                    text={hudSummary('actionPoints')}
                    onReadMore={() => onOpenHandbook(hudNumberTopic('actionPoints'))}
                    testId="hud-info-action-points"
                  />
                </span>
                <span className="ds-hud-value">{state.house.actionPoints}</span>
              </span>
            </div>
          )}
        </header>

        <div className="desk-map-sheet">
          <span className="desk-masking-tape is-tl" aria-hidden="true" />
          <span className="desk-masking-tape is-tr" aria-hidden="true" />
          <span className="desk-brass-weight" aria-hidden="true" />
          <div className="desk-map-inner">{mapSlot}</div>
        </div>

        <div className="desk-bottom-left">
          <div className="desk-telex-box" data-testid="telex-ticker">
            <div className="desk-telex-header">
              <span className="desk-dymo">TELEX FEED · WIRE</span>
              <button type="button" className="desk-mini-link" onClick={() => onSelectView('news')}>
                OPEN WIRE DESK ▸
              </button>
            </div>
            <div className="desk-telex-roll" tabIndex={0} role="region" aria-label="Telex feed">
              {headlines.length === 0 ? (
                <div className="desk-telex-line">Quiet on the line.</div>
              ) : (
                headlines.map((ev) => (
                  <div key={ev.id} className="desk-telex-line">
                    <strong>[T{String(ev.turn).padStart(2, '0')}]</strong> {ev.headline}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="desk-clipboard ds-quarterband">
            <div className="desk-clipboard-clip" aria-hidden="true" />
            <button
              type="button"
              className="ds-quarterband-head desk-clipboard-head"
              onClick={() => setQuarterExpanded((v) => !v)}
              aria-expanded={quarterExpanded}
              data-testid="quarterband-toggle"
            >
              <span className="ds-quarterband-icon" aria-hidden="true">
                ◆
              </span>
              <span className="ds-quarterband-label">This Quarter</span>
              <span className="ds-quarterband-count">{quarterCount}</span>
              {boardWarning && (
                <span className="ds-quarterband-warning" aria-hidden="true" data-testid="quarterband-board-warning">
                  ⚠
                </span>
              )}
              {memos.length > 0 && (
                <span
                  className="ds-quarterband-memos"
                  data-testid="quarterband-memo-count"
                  aria-label={`${memos.length} unread memo${memos.length === 1 ? '' : 's'}`}
                >
                  ✉ {memos.length}
                </span>
              )}
              <span className="ds-quarterband-spacer" />
              <span className="ds-quarterband-chevron" aria-hidden="true">
                {quarterExpanded ? '▴' : '▾'}
              </span>
            </button>

            {quarterExpanded && (
              <div className="ds-quarterband-body desk-clipboard-body" data-testid="quarterband-body">
                {quarterNotices.length > 0 && (
                  <div className="ds-quarterband-notice" data-testid="quarterband-notice">
                    {quarterNotices.map((n) => (
                      <p key={n.id} className="ds-quarterband-item" data-testid={`quarterband-notice-${n.id}`}>
                        <span aria-hidden="true">{n.icon}</span> {n.text}
                      </p>
                    ))}
                  </div>
                )}
                {memos.map((memo) => (
                  <button
                    key={memo.id}
                    type="button"
                    className="ds-quarterband-item-button is-memo"
                    onClick={() => onOpenMemo(memo.id)}
                    data-testid={`quarterband-memo-${memo.id}`}
                  >
                    <span className="ds-quarterband-item-icon" aria-hidden="true">
                      ✉
                    </span>
                    MEMO {memo.date} — {memo.subject}
                  </button>
                ))}
                {boardWarning && (
                  <p className="ds-quarterband-item is-warn" data-testid="quarterband-board-warning-item">
                    Board review next turn — at {currentPct.toFixed(0)}%, need {requiredPct.toFixed(0)}% to stay on track.
                  </p>
                )}
                {quarterItems.map((item) => {
                  const yarnTarget = yarnTargetForThisQuarter(item, state)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="ds-quarterband-item-button"
                      onMouseEnter={(e) => {
                        if (yarnTarget) connectYarn(e.currentTarget, yarnTarget, 'red')
                      }}
                      onMouseLeave={clearYarn}
                      onClick={() => onNavigateQuarterItem(item.target)}
                      data-testid={`quarterband-item-${item.id}`}
                    >
                      <span className="ds-quarterband-item-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      {item.label}
                    </button>
                  )
                })}
                {quarterCount === 0 && quarterNotices.length === 0 && memos.length === 0 && (
                  <p className="ds-quarterband-item is-quiet">Nothing needs your attention.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="desk-right-column">
        <div className="desk-dossier-stack">
          <nav className="desk-manila-tabs ds-tabbar" data-testid="tabbar" aria-label="Dossier folders">
            {TABS.map((tab) => {
              const count = tab.view === 'contracts' ? state.market.openOrders.length : undefined
              const isActive = activeView === tab.view
              return (
                <button
                  key={tab.view}
                  type="button"
                  className={isActive ? 'desk-manila-tab ds-tabbar-item is-active' : 'desk-manila-tab ds-tabbar-item'}
                  onClick={() => {
                    if (tab.view !== 'operations') onSelectCountry(null)
                    onSelectView(tab.view)
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  data-testid={`tab-${tab.view}`}
                >
                  <span className="ds-tabbar-icon" aria-hidden="true">
                    {tab.icon}
                  </span>
                  <span className="ds-tabbar-label">{tab.label}</span>
                  {count !== undefined && count > 0 && <span className="ds-tabbar-count">{count}</span>}
                </button>
              )
            })}
          </nav>

          <main className="desk-manila-body ds-shell-content">
            {bannerSlot}
            {activeView === 'operations' ? (
              countryFileSlot ? (
                countryFileSlot
              ) : (
                <TheatreOperationsBrief
                  state={state}
                  onSelectCountry={(fId) => onSelectCountry(fId)}
                  onSelectView={onSelectView}
                />
              )
            ) : (
              folderContentSlot
            )}
          </main>
        </div>

        <div className="desk-bottom-right ds-actiondock" data-testid="action-dock">
          <div className="desk-outbox-tray">
            <div className="desk-outbox-head">
              <span className="desk-dymo">DISPATCH OUTBOX · {state.house.actionPoints} EXECUTIVE SLOTS</span>
              <button type="button" className="desk-mini-link" onClick={onOpenCatalog}>
                ACTION CATALOG ▸
              </button>
            </div>
            <div className="ds-actiondock-slots desk-outbox-slots">
              {Array.from({ length: slotsCount }, (_, i) => {
                const action = actions[i]
                if (!action) {
                  return <ActionSlot key={i} empty onOpen={onOpenCatalog} testId={`action-slot-${i}-empty`} />
                }
                const { icon, label, cost } = actionSummary(state, action)
                const targetNode = yarnTargetForAction(action, state)
                return (
                  <div
                    key={i}
                    className="desk-slot-wrap"
                    onMouseEnter={(e) => {
                      if (targetNode) connectYarn(e.currentTarget, targetNode, 'amber')
                    }}
                    onMouseLeave={clearYarn}
                  >
                    <ActionSlot
                      icon={icon}
                      label={label}
                      cost={cost}
                      onRemove={() => onRemoveAction(i)}
                      testId={`action-slot-${i}`}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            className="desk-calendar-btn ds-button is-primary ds-actiondock-end"
            onClick={onEndTurn}
            disabled={ended}
            data-testid="end-quarter-button"
          >
            <span className="desk-cal-rings" aria-hidden="true">
              <span className="desk-cal-ring" />
              <span className="desk-cal-ring" />
            </span>
            <span className="desk-cal-sheet">
              <span className="desk-cal-turn">TURN {state.meta.turn}</span>
              <span className="desk-cal-quarter">
                Q{state.meta.quarter} {state.meta.year}
              </span>
            </span>
            <span className="desk-cal-cta">End Quarter</span>
          </button>
        </div>
      </section>
    </div>
  )
}
