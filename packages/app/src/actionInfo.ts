// actionInfo — P163 (ETAPP10_FORSLAG.md §3b, S3): vad varje verb gör, vad det ger och vad det riskerar, i en mening var. Det är den TEXT som handlingskortet
// (ActionCard.tsx) och Actions-menyn visar; talen (kostnad, chans, före → efter) läses alltid ur previewAction, aldrig härifrån — texten här innehåller
// därför inga siffror (ett tal i en mening glider när balansen ändras, ett tal ur previewAction gör det inte).
//
// Täckningen binds av test/actionInfo.test.ts: varje verb i actionCatalog.ts och varje verb i handbook.ts:s VERB_TOPIC måste ha en post här.
import type { PlayerAction } from '@seventh-front/core'

export interface ActionInfo {
  does: string // vad verbet gör, en mening — det som står på Actions-menyn
  gain: string // vad du får (visas när previewAction inte ger ett före → efter-värde)
  risk: string // vad du riskerar
  certain?: string // sätts bara när verbet inte är slumpavgjort: raden "Chance" visar den texten i stället för en procent
  costNote?: string // sätts när previewAction ger cost = null men verbet ändå har ett pris eller en följd: visas på "Cost"-raden
}

export const ACTION_INFO: Readonly<Record<string, ActionInfo>> = {
  EXPAND: {
    does: 'Adds one level of intelligence depth to one of your stations.',
    gain: 'Narrower price bands and clearer formations in that country.',
    risk: 'Every expansion raises the station\'s exposure. A station that is exposed too much is burned and lost.',
    certain: 'Always works',
  },
  WITHDRAW: {
    does: 'Puts one of your stations to sleep.',
    gain: 'Nothing: a dormant station still counts toward your limit of five and still costs upkeep.',
    risk: 'A dormant station gives no insight, and there is no way to reopen it.',
    certain: 'Always works',
    costNote: 'No cost',
  },
  RECRUIT: {
    does: 'Opens a new station in a country where you have none.',
    gain: 'A station at depth 0 that you can build up with EXPAND. You can hold five stations at most.',
    risk: 'At depth 0 formations are still unknown, and the station adds to your running costs.',
    certain: 'Always works',
  },
  LEAK: {
    does: 'Leaks damaging information about a rival house.',
    gain: 'The rival\'s relations with that country fall.',
    risk: 'If you are traced, the country\'s counter-intelligence sharpens and your station becomes more exposed.',
  },
  SABOTAGE: {
    does: 'Sabotages a rival house\'s operations.',
    gain: 'The rival cannot bid for a few quarters.',
    risk: 'If you are traced, the country\'s counter-intelligence sharpens and your station becomes more exposed.',
  },
  TURN: {
    does: 'Tries to turn one official in the country to your side.',
    gain: 'The official\'s relation to you rises.',
    risk: 'If it fails, the official\'s standing falls, counter-intelligence sharpens and your station becomes more exposed.',
  },
  INFLUENCE: {
    does: 'Pays to move a country\'s public support, or its relations with another country.',
    gain: 'The chosen value moves up or down by an amount that grows with what you spend.',
    risk: 'Nothing beyond the money.',
    certain: 'Always works',
  },
  STAGE_INCIDENT: {
    does: 'Stages an incident against a country at its front.',
    gain: 'Heat rises where the country fights, and relations with its front opponent worsen.',
    risk: 'If attribution fails you are linked to it and a station becomes more exposed. An incident against a strongly aligned country can raise doomsday.',
  },
  BACK_CHANNEL: {
    does: 'Opens a quiet line to a country\'s front opponent.',
    gain: 'Doomsday eases and relations between the two countries improve.',
    risk: 'Only the money.',
    certain: 'Always works',
  },
  FUND_COUP: {
    does: 'Funds a coup against the country\'s regime. One attempt per country, ever.',
    gain: 'If it succeeds, the country\'s alignment flips, the old regime\'s contracts are cancelled and you get a right of first refusal for a time.',
    risk: 'If it fails, the country\'s counter-intelligence grows and its relation to you is damaged permanently.',
  },
  BROKER: {
    does: 'Strikes a direct contract with a buyer, past the normal bidding, at the price you set.',
    gain: 'A contract with no competition. It is only allowed when the procurement official\'s relation to you is high enough and their integrity low enough.',
    risk: 'The official\'s standing falls and their scandal risk rises, your station there becomes more exposed, and it leaves a paper trail.',
    certain: 'Always works once allowed',
    costNote: 'Nothing upfront',
  },
  BRIBE: {
    does: 'Pays an official for goodwill.',
    gain: 'The official\'s relation to you rises, more steeply the lower their integrity is.',
    risk: 'It raises the official\'s scandal risk, and the paper trail can come out later.',
    certain: 'Always works',
  },
  FUND_CAMPAIGN: {
    does: 'Funds an official\'s campaign.',
    gain: 'Their standing rises, so their position is safer. Their relation to you is not touched.',
    risk: 'Only the money.',
    certain: 'Always works',
  },
  FAVOUR: {
    does: 'Does an official a favour and takes the cost out of your margin instead of your cash.',
    gain: 'The official\'s relation to you rises.',
    risk: 'The price becomes a debt that is deducted from what your next deliveries pay.',
    certain: 'Always works',
    costNote: 'Taken from future margin',
  },
  ASSASSINATE: {
    does: 'Removes an official permanently. A successor is appointed.',
    gain: 'The post changes hands, and the successor starts with no relation to you.',
    risk: 'The country\'s counter-intelligence grows, and for a bloc-bound country doomsday can rise. More money softens the fallout.',
    certain: 'Always works',
  },
  TAKE_LOAN: {
    does: 'Borrows cash against your credit limit.',
    gain: 'Cash now.',
    risk: 'Interest is charged every quarter until you repay.',
    costNote: 'You receive the cash',
  },
  REPAY: {
    does: 'Pays down your debt.',
    gain: 'Less debt means less interest and more room under the credit limit.',
    risk: 'The cash is gone, so you can bid and invest less.',
    certain: 'Always works',
  },
  BUILD_LINE: {
    does: 'Builds one more production line.',
    gain: 'More capacity: you can build another won contract in parallel.',
    risk: 'Every line adds to your fixed costs each quarter, busy or not.',
    certain: 'Always works',
  },
  HIRE: {
    does: 'Hires staff for one role.',
    gain: 'The role rises. Nothing happens until it passes the role\'s threshold; above it you get the role\'s effect.',
    risk: 'The fee is paid at once, even if the hire does not take the role past its threshold.',
    certain: 'Always works',
  },
  REPRIORITISE_RND: {
    does: 'Puts a crash programme on a research project.',
    gain: 'The project finishes in half the time.',
    risk: 'It costs twice as much in total, and you cannot bid in that category next quarter.',
    certain: 'Always works',
  },
  BUY_FORWARD: {
    does: 'Reserves a raw material at today\'s price.',
    gain: 'A reserve that discounts your future material costs for that commodity.',
    risk: 'The cash is tied up in the reserve.',
    certain: 'Always works',
  },
  RELEASE: {
    does: 'Releases a reserve of a raw material back into cash.',
    gain: 'Cash back from the reserve.',
    risk: 'You lose the discount on future material costs.',
    certain: 'Always works',
    costNote: 'You receive the cash',
  },
  FIELD_TRIAL: {
    does: 'Tests one of your designs in the field with a buyer.',
    gain: 'The uncertainty about the design\'s class narrows, and a hidden flaw may come out. The buyer remembers it in its next procurement.',
    risk: 'The trial batch is paid at cost, and the result becomes known to your rivals too.',
    certain: 'Always works',
  },
  REVERSE_ENGINEER: {
    does: 'Studies captured enemy materiel.',
    gain: 'A research head start in the category: your next project there finishes sooner.',
    risk: 'Only the cost of the study.',
    certain: 'Always works',
  },
  PROCUREMENT: {
    does: 'Works a development procurement: write the spec, hand-build a prototype, counter-purchase, or pull a darker trick.',
    gain: 'A better position when the buyer picks a supplier.',
    risk: 'Some moves leave a paper trail that can come out later.',
    costNote: 'Varies with the move',
  },
}

export function actionInfo(verb: string): ActionInfo | null {
  return ACTION_INFO[verb] ?? null
}

// Verbet bakom en PlayerAction, så som Actions-menyn och handboken stavar det (INTERNAL/INTEL/POLITICAL/MARKET bär verbet i `op`).
export function actionVerb(action: PlayerAction): string | null {
  switch (action.type) {
    case 'INTERNAL':
    case 'INTEL':
    case 'POLITICAL':
    case 'MARKET':
      return action.op
    case 'PROCUREMENT':
      return 'PROCUREMENT'
    case 'BROKER':
      return 'BROKER'
    default:
      return null // CRISIS är ett svar på ett kort, inte ett verb ur menyn
  }
}
