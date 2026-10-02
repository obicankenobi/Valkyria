// LedgerChart — huvudboken i THE COMPANY (P97, ETAPP8_FORSLAG.md §3.2).
// "Grönlinjerat bokföringspapper med intäkter och kostnader som staplar i blyerts, kassan
// som en kurva i blått fettkrita och styrelsens mål som en röd streckad linje. Tryck på ett
// kvartal öppnar kvartalets verifikationer (regel 13)." All data kommer ur ledgerChart.ts
// (rent, testat) som i sin tur läser GameState.ledger (P96) — inget räknas om här.
//
// Träffytan: 21 kvartal på ett 390 px brett kort är ~14 px per kvartal, långt under regel
// 11:s 44×44. Hela diagrammet är därför EN knapp (en stor träffyta, tryckets x-läge väljer
// närmaste bokförda kvartal), och verifikationsarket har en Stepper (två 44 px-knappar) för
// att bläddra mellan kvartalen. Ett tangentbordstryck (Enter, inget x-läge) öppnar senaste
// kvartalet — samma sak som en pekare ger vid högerkanten.
import { useState } from 'react'
import type { MouseEvent } from 'react'
import { boardReviewOutlook } from '@seventh-front/core'
import type { GameState, LedgerEntry } from '@seventh-front/core'
import { deriveLedgerChart, turnAtRatio } from '../ledgerChart.js'
import { EXPENSE_LABELS, FINANCING_LABELS, INCOME_LABELS } from '../ledgerLabels.js'
import { BottomSheet, DsPanel, Stepper } from './designSystem.js'
import { Tag, formatMoney } from './ui.js'

const W = 340
const H = 232
const ML = 46 // plats för y-etiketterna
const MR = 10
const MT = 12
const MB = 26
const PLOT_W = W - ML - MR
const PLOT_H = H - MT - MB

function formatAxis(value: number): string {
  if (value === 0) return '£0'
  const sign = value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${sign}£${+(abs / 1_000_000).toFixed(1)}M`
  return `${sign}£${Math.round(abs / 1000)}k`
}

function sum(record: Record<string, number | undefined>): number {
  return Object.values(record).reduce<number>((total, value) => total + (value ?? 0), 0)
}

function VoucherGroup<K extends string>({
  title,
  labels,
  values,
  sign,
}: {
  title: string
  labels: Record<K, string>
  values: Partial<Record<K, number>> // en rad kan saknas i ett sparat parti från före P133 (income.civil)
  sign: '+' | '−'
}) {
  const rows = (Object.keys(labels) as K[]).filter((key) => (values[key] ?? 0) > 0)
  return (
    <div className="voucher-group">
      <h4 className="voucher-group-title">{title}</h4>
      {rows.length === 0 ? (
        <p className="voucher-none">— nothing booked —</p>
      ) : (
        <dl className="voucher-lines">
          {rows.map((key) => (
            <div className="voucher-line" key={key} data-testid={`ledger-voucher-row-${key}`}>
              <dt>{labels[key]}</dt>
              <dd>
                {sign}
                {formatMoney(values[key] ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function Vouchers({ entry }: { entry: LedgerEntry }) {
  const net = sum(entry.income) - sum(entry.expenses) + entry.financing.loans - entry.financing.repayments
  return (
    <div className="voucher" data-testid="ledger-voucher">
      <VoucherGroup title="Income" labels={INCOME_LABELS} values={entry.income} sign="+" />
      <VoucherGroup title="Expenses" labels={EXPENSE_LABELS} values={entry.expenses} sign="−" />
      <div className="voucher-group">
        <h4 className="voucher-group-title">Financing</h4>
        {entry.financing.loans === 0 && entry.financing.repayments === 0 ? (
          <p className="voucher-none">— nothing booked —</p>
        ) : (
          <dl className="voucher-lines">
            {entry.financing.loans > 0 && (
              <div className="voucher-line" data-testid="ledger-voucher-row-loans">
                <dt>{FINANCING_LABELS.loans}</dt>
                <dd>+{formatMoney(entry.financing.loans)}</dd>
              </div>
            )}
            {entry.financing.repayments > 0 && (
              <div className="voucher-line" data-testid="ledger-voucher-row-repayments">
                <dt>{FINANCING_LABELS.repayments}</dt>
                <dd>−{formatMoney(entry.financing.repayments)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      <dl className="voucher-lines voucher-totals">
        <div className="voucher-line" data-testid="ledger-voucher-net">
          <dt>Change in treasury</dt>
          <dd className={net < 0 ? 'is-negative' : undefined}>{net < 0 ? `−${formatMoney(-net)}` : `+${formatMoney(net)}`}</dd>
        </div>
        <div className="voucher-line">
          <dt>Treasury at quarter end</dt>
          <dd data-testid="ledger-voucher-treasury">{formatMoney(entry.treasuryEnd)}</dd>
        </div>
        <div className="voucher-line">
          <dt>Debt at quarter end</dt>
          <dd>{formatMoney(entry.debtEnd)}</dd>
        </div>
        <div className="voucher-line">
          <dt>Credit limit at quarter end</dt>
          <dd>{formatMoney(entry.creditLimitEnd)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function LedgerChart({ state }: { state: GameState }) {
  const [openTurn, setOpenTurn] = useState<number | null>(null)
  const data = deriveLedgerChart(state)

  if (!data) {
    return (
      <DsPanel title="General ledger">
        <p className="empty" data-testid="ledger-empty">
          No quarter has been closed yet. The ledger fills in as you end quarters.
        </p>
      </DsPanel>
    )
  }

  const ySpan = data.yMax - data.yMin || 1
  const slots = data.xMax - data.xMin + 1
  const slotW = PLOT_W / slots
  const xOf = (turn: number) => ML + (turn - data.xMin + 0.5) * slotW
  const yOf = (value: number) => MT + (1 - (value - data.yMin) / ySpan) * PLOT_H
  const zeroY = yOf(0)
  const barW = Math.max(3, slotW * 0.62)
  const points = (series: { turn: number; value: number }[]) => series.map((p) => `${xOf(p.turn)},${yOf(p.value)}`).join(' ')

  const outlook = boardReviewOutlook(state)
  const nextMark = data.reviewMarks.find((m) => m.turn === outlook.nextReviewTurn)
  const xTicks = Array.from({ length: slots }, (_, i) => data.xMin + i).filter(
    (t) => t % 5 === 0 || t === data.xMax || data.reviewMarks.some((m) => m.turn === t),
  )

  const entry = openTurn === null ? null : (state.ledger.find((e) => e.turn === openTurn) ?? null)
  const firstTurn = data.bars[0]!.turn
  const lastTurn = data.bars[data.bars.length - 1]!.turn

  function handleOpen(event: MouseEvent<HTMLButtonElement>) {
    // detail 0 = tangentbordsaktivering (ingen pekarposition): senaste kvartalet.
    if (event.detail === 0 || !data) {
      setOpenTurn(lastTurn)
      return
    }
    // Positionen mäts mot SVG:ns egen ruta (knappen kan vara bredare än en skalad SVG).
    const svg = event.currentTarget.querySelector('svg')
    const rect = (svg ?? event.currentTarget).getBoundingClientRect()
    if (rect.width === 0) {
      setOpenTurn(lastTurn) // ingen layout (t.ex. jsdom): senaste kvartalet i stället för NaN
      return
    }
    const viewX = ((event.clientX - rect.left) / rect.width) * W
    setOpenTurn(turnAtRatio(data, (viewX - ML) / PLOT_W))
  }

  return (
    <DsPanel
      title="General ledger"
      right={
        <Tag tone={data.bookNow && nextMark && data.bookNow.value >= nextMark.value ? 'green' : 'amber'}>
          {outlook.nextReviewTurn !== null ? `Review T${outlook.nextReviewTurn}` : 'No reviews left'}
        </Tag>
      }
    >
      <button
        type="button"
        className="ledger-chart-hit"
        onClick={handleOpen}
        aria-label="Open the vouchers for a quarter"
        data-testid="ledger-chart"
      >
        <svg className="ledger-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Income and expenses per quarter, treasury, and the board's required pace">
          <defs>
            <pattern id="ledger-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill="transparent" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--ink-dim)" strokeWidth="1.6" />
            </pattern>
          </defs>
          {data.yTicks.map((tick) => (
            <g key={tick}>
              <line className="ledger-rule" x1={ML} x2={W - MR} y1={yOf(tick)} y2={yOf(tick)} />
              <text className="ledger-axis-label" x={ML - 6} y={yOf(tick) + 3} textAnchor="end">
                {formatAxis(tick)}
              </text>
            </g>
          ))}
          <line className="ledger-zero" x1={ML} x2={W - MR} y1={zeroY} y2={zeroY} />

          {data.bars.map((bar) => (
            <g key={bar.turn} data-testid={`ledger-bar-${bar.turn}`}>
              {bar.income > 0 && <rect className="ledger-bar-income" x={xOf(bar.turn) - barW / 2} y={yOf(bar.income)} width={barW} height={zeroY - yOf(bar.income)} />}
              {bar.expenses > 0 && <rect className="ledger-bar-expense" x={xOf(bar.turn) - barW / 2} y={zeroY} width={barW} height={yOf(-bar.expenses) - zeroY} />}
            </g>
          ))}

          <polyline className="ledger-target" points={points(data.target)} />
          {data.reviewMarks.map((mark) => (
            <g key={mark.turn}>
              <circle className="ledger-review-dot" cx={xOf(mark.turn)} cy={yOf(mark.value)} r="3.6" />
            </g>
          ))}
          <polyline className="ledger-cash" points={points(data.cash)} />
          {data.bookNow && <circle className="ledger-book-now" cx={xOf(data.bookNow.turn)} cy={yOf(data.bookNow.value)} r="5" data-testid="ledger-book-now" />}

          {xTicks.map((t) => (
            <text key={t} className="ledger-axis-label" x={xOf(t)} y={H - 8} textAnchor="middle">
              {`T${t}`}
            </text>
          ))}
        </svg>
      </button>

      <ul className="ledger-legend" aria-label="Legend">
        <li>
          <span className="ledger-key is-income" aria-hidden="true" />
          Income
        </li>
        <li>
          <span className="ledger-key is-expense" aria-hidden="true" />
          Expenses
        </li>
        <li>
          <span className="ledger-key is-cash" aria-hidden="true" />
          Treasury
        </li>
        <li>
          <span className="ledger-key is-target" aria-hidden="true" />
          Board pace
        </li>
        <li>
          <span className="ledger-key is-book" aria-hidden="true" />
          Book now
        </li>
      </ul>

      <p className="ledger-summary" data-testid="ledger-summary">
        Book now {formatMoney(data.bookNow?.value ?? 0)} (revenue booked + order book).
        {nextMark ? ` The board wants ${formatMoney(nextMark.value)} by T${nextMark.turn}.` : ' No more reviews.'}
      </p>

      <BottomSheet
        open={entry !== null}
        title={entry ? `Quarter T${entry.turn}` : ''}
        subtitle="Vouchers — general ledger"
        onClose={() => setOpenTurn(null)}
        testId="ledger-vouchers"
      >
        {entry && (
          <>
            <Vouchers entry={entry} />
            <Stepper
              label="Quarter"
              value={entry.turn}
              min={firstTurn}
              max={lastTurn}
              onChange={setOpenTurn}
              format={(t) => `T${t}`}
              testId="ledger-voucher-stepper"
            />
          </>
        )}
      </BottomSheet>
    </DsPanel>
  )
}
