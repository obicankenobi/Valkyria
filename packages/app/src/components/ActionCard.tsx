// ActionCard — P163 (ETAPP10_FORSLAG.md §3b, S3): ETT kort för alla verb. En mening om vad verbet gör, vad det kostar, hur troligt det är, vad du får och vad du
// riskerar, och en länk till handboken. Talen (kostnad, chans, före → efter) läses ur previewAction — samma formler som turen faktiskt avgörs med; texten
// läses ur actionInfo.ts. Med `action = null` (verbet är valt men inget mål än) visas texten och en uppmaning att välja ett mål.
import { previewAction } from '@seventh-front/core'
import type { GameState, PlayerAction } from '@seventh-front/core'
import { actionInfo } from '../actionInfo.js'
import { verbTopic } from '../handbook.js'
import { useOpenHandbook } from '../uiContext.js'
import { formatMoney } from './ui.js'
import { VerbIcon } from './VerbIcon.js'

export function ActionCard({
  state,
  verb,
  action,
  testId,
  unsetNote = 'Shown once you choose a target',
}: {
  state: GameState
  verb: string
  action: PlayerAction | null
  testId?: string
  unsetNote?: string // vad Cost/Chance säger när verbet är valt men ingen handling finns än
}) {
  const info = actionInfo(verb)
  const openHandbook = useOpenHandbook()
  if (!info) return null
  const preview = action ? previewAction(state, action) : null
  const topic = verbTopic(verb)

  const cost = preview ? (preview.cost !== null ? formatMoney(preview.cost) : (info.costNote ?? 'No cost')) : unsetNote
  let chance: string | null
  if (!preview) chance = info.certain ?? unsetNote
  else if (!preview.successPctKnown) chance = 'Unknown — you need intelligence in that country'
  else if (preview.successPct !== null) chance = `${Math.round(preview.successPct)}%`
  else chance = info.certain ?? null

  return (
    <div className="action-card" data-testid={testId ?? `action-card-${verb}`}>
      <div className="action-card-head">
        <span className="action-card-icon" aria-hidden="true">
          <VerbIcon verb={verb} />
        </span>
        <p className="action-card-does" data-testid="action-card-does">
          {info.does}
        </p>
      </div>
      <dl className="action-card-rows">
        <div className="action-card-row">
          <dt>Cost</dt>
          <dd data-testid="action-card-cost">{cost}</dd>
        </div>
        {chance !== null && (
          <div className="action-card-row">
            <dt>Chance</dt>
            <dd data-testid="action-card-chance">{chance}</dd>
          </div>
        )}
        <div className="action-card-row">
          <dt>You get</dt>
          <dd data-testid="action-card-gain">
            {info.gain}
            {preview?.effect && (
              <span className="action-card-effect" data-testid="action-card-effect">
                {preview.effect.label} {Math.round(preview.effect.before)} → ~{Math.round(preview.effect.after)}
              </span>
            )}
          </dd>
        </div>
        <div className="action-card-row">
          <dt>You risk</dt>
          <dd data-testid="action-card-risk">{info.risk}</dd>
        </div>
      </dl>
      {topic && openHandbook && (
        <button type="button" className="action-card-more" onClick={() => openHandbook(topic)} data-testid={`action-card-handbook-${verb}`}>
          Read more in the Handbook →
        </button>
      )}
    </div>
  )
}
