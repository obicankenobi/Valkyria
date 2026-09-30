// handbook — P91b (ETAPP7_TEKNISK_SPEC.md §9/§13, P81-20): "en uppslagsbok
// i spelet, nåbar från menyn och från varje info-ikon, med ett uppslag per
// mekanik (upphandling, produktion, styrelsen, doomsday, heat, underrättelse,
// politik, fronter)." Ren data, samma princip som mapLegend.ts:s MAP_LEGEND
// — en post per ämne, aldrig härledd ur state.
//
// GENUINT FYND, rättat innan commit: en första version av den här filen
// skrev titel/summary/body på svenska — ett brott mot P21:s redan
// etablerade "hela UI:t på engelska" (CLAUDE.md, ETAPP7_TEKNISK_SPEC.md
// §13:s P21-rad), som varje senare prompt sedan dess följt utan undantag.
// Rättat till engelska rakt igenom, id:na inkluderat (koden/kommentarerna
// runt filen förblir svenska, samma konvention som resten av repot).
//
// Klart när (ordagrant): "ett test underkänner om ett verb eller ett
// HUD-tal saknar uppslag." Löst med två små uppslagstabeller nedan
// (VERB_TOPIC/HUD_NUMBER_TOPIC) som handbook.test.ts korsreferenserar mot
// actionCatalog.ts:s 22 verb och en handhållen HUD_NUMBERS-lista.
//
// SCOPE-BESLUT, dokumenterade tolkningar snarare än gissningar:
// - Turen/datumet (HUD:ens "1965 · Q1") har inget eget uppslag — det är
//   inte en spelmekanik som behöver förklaras, bara en klocka.
// - Treasury/Debt/Credit limit/Action points saknar en egen topic bland de
//   åtta specen namnger — mappade till 'board', husets ekonomiska
//   överlevnad är exakt vad styrelsegranskningarna mäter.
// - TAKE_LOAN/REPAY mappade till 'board' av samma skäl; BUILD_LINE/HIRE/
//   REPRIORITISE_RND/BUY_FORWARD/RELEASE mappade till 'production'
//   (kapacitet, personal, R&D och de råvaror som föder linjerna).
export type HandbookTopicId = 'procurement' | 'production' | 'board' | 'doomsday' | 'heat' | 'intelligence' | 'politics' | 'fronts'

export interface HandbookEntry {
  id: HandbookTopicId
  title: string
  // Kort — vad InfoTooltip visar (designSystem.tsx, byggd i P73, aldrig
  // kopplad in förrän nu). Regel 14: minst 13 px brödtext, men en tooltip-
  // bubbla har inte plats för långa stycken — hålls till en-två meningar.
  summary: string
  // Längre — vad Handbook.tsx:s fulla uppslag visar. Ett stycke per element.
  body: readonly string[]
}

export const HANDBOOK: readonly HandbookEntry[] = [
  {
    id: 'procurement',
    title: 'Procurement',
    summary: 'Buyers put out orders; you bid on price, delivery time, and a bribe. The highest bid does not always win — the recipient\'s agenda and integrity matter too.',
    body: [
      'Each buyer (a faction) regularly puts out orders for a specific weapon type, in a quantity and with a deadline that depend on how hard-pressed the front is right now. An order shows as a stamped folder on CONTRACTS, with the buyer\'s name and a deadline before it is decided.',
      'A bid sets three things: price, delivery time, and an optional bribe to the buyer\'s procurement official. The price is compared against what it actually costs you to build the item (your margin) and against what rival houses are likely to bid. A lower, faster, more generous offer wins more often — but never a guarantee.',
      'When a bid wins it becomes a contract: part of the payment arrives immediately (an advance share that varies per order), the rest when the units actually deliver. A contract can go late (a missed deadline) or be voided (e.g. if the buyer\'s regime falls in a coup) — see Politics.',
      'Winning a contract close to your own unit cost does not pay the house\'s fixed costs: payroll, line upkeep and interest come due every quarter whatever you win. Price for a margin, not just for the win.',
    ],
  },
  {
    id: 'production',
    title: 'Production',
    summary: 'Your lines manufacture against won contracts at their own pace. Build more lines or hire staff to raise capacity; research unlocks which products you can sell.',
    body: [
      'Each production line works against one won contract at a time, at its own pace (units per turn). A line can manufacture any product — no line is locked to a single weapon type.',
      'THE COMPANY shows your lines\' status, the house\'s fixed costs, and interest on debt. BUILD_LINE builds a new line (a one-off investment); HIRE hires staff who raise throughput or research speed; REPRIORITISE_RND moves research resources between tech categories.',
      'Research (R&D) raises techLevel per category. A techLevel that is too low disqualifies you from bidding on the most advanced products in that category — a hard gate, not a scoring penalty.',
      'The raw materials panel (BUY_FORWARD/RELEASE) lets you reserve or release a share of a commodity ahead of time, as a hedge against supplyCostIndex rising before you need it.',
    ],
  },
  {
    id: 'board',
    title: 'The Board',
    summary: 'The board reviews your booked and projected revenue at fixed turns. Two failed reviews in a row — or unpaid debt for too long — and the house is sold or liquidated.',
    body: [
      'The board target (shown in the HUD as "Bd") measures your revenue (booked and projected, from orders already placed) against a threshold. The target is tested at fixed turns during the game — the HUD shows how many turns remain until the next review.',
      'Two failed reviews in a row give BUYOUT: the house is sold, the game ends. Three insolvent turns in a row (debt exceeds what the house can pay) give INSOLVENCY instead.',
      'Treasury (cash on hand), Debt, and Credit limit belong here: TAKE_LOAN raises debt against interest, REPAY lowers it. High debt eats into the credit limit and makes the next loan more expensive.',
      'Action points (the house\'s staff) cap how many executive actions — both INTERNAL (production/economy) and POLITICAL (intelligence and politics) — you can queue in a given quarter.',
    ],
  },
  {
    id: 'doomsday',
    title: 'Doomsday',
    summary: 'A global gauge of how close the world is to nuclear war. Some of your own actions (restricted deliveries, assassinations, staged incidents) raise it. At 100% the game is over.',
    body: [
      'Doomsday is a global value, 0–100, that rises from certain player actions and world events: delivering restricted products (e.g. napalm), ASSASSINATE, a bloc-aligned nation\'s FUND_COUP, and staged incidents that escalate.',
      'At threshold values along the way, crises trigger — a full-screen card with three choices (PUSH, BACK DOWN, SELL THE FILE), each with different economic and doomsday consequences.',
      'If doomsday reaches 100%, the game ends in NUCLEAR_EXCHANGE — the epilogue then shows which deliveries and actions led there.',
      'RESTRAINT, one of the epilogue\'s four axes, is doomsdayPeak: the highest doomsday value the game ever reached. Lower is better — even if you never actually crossed 100%.',
    ],
  },
  {
    id: 'heat',
    title: 'Heat',
    summary: 'How hot a conflict is in a theatre right now — more heat means more demand for weapons, but also a higher risk of escalation. Cools when nobody delivers into active fighting.',
    body: [
      'Each theatre (Indochina, Laos) has its own heat value. It rises when materiel is delivered into a front still at war, and cools slowly during turns without such deliveries.',
      'On the map, heat shows as a glow around the theatre — a stronger glow means a hotter conflict. High heat drives up demand (more and larger orders) but also raises the risk that a crisis triggers in that theatre.',
      'Heat is therefore a direct consequence of how much war you yourself supply — a front you never deliver to cools on its own, regardless of how it develops militarily.',
    ],
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    summary: 'A station in a country gives you insight (otherwise formations and officials show as unknown) and unlocks six verbs: EXPAND, WITHDRAW, LEAK, SABOTAGE, TURN, RECRUIT.',
    body: [
      'A station in a country gives you intelligence depth there — without an active station, a country\'s formations and officials show as unknown (a dashed frame with a question mark on the map). RECRUIT establishes a new station in a country that lacks one; EXPAND deepens an already active one; WITHDRAW pulls it back.',
      'LEAK damages a chosen rival\'s relations with a nation by leaking harmful information. SABOTAGE takes a rival out of contention for deliveries for a time. TURN targets a single official — success raises your relation to that person, failure damages their standing.',
      'All intelligence operations share a success chance that is scaled down by the target\'s counterIntelligence — the better the opponent\'s counter-espionage, the harder it is to succeed, and the greater the risk of being caught.',
      'A station exposed too much risks being burned (a pulsing ring on the map warns in advance) — a burned station is lost and must be re-established with RECRUIT.',
    ],
  },
  {
    id: 'politics',
    title: 'Politics',
    summary: 'Influence individual officials (BRIBE, FUND_CAMPAIGN, FAVOUR, ASSASSINATE) or whole nations (INFLUENCE, STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP, BROKER) — reached in CONTACTS and country files.',
    body: [
      'Each buying faction has named officials with their own agenda, standing, and relation to you. BRIBE and FUND_CAMPAIGN buy improved relations directly; FAVOUR costs margin, not cash — the price becomes a debt deducted from what your next deliveries pay; ASSASSINATE removes an official permanently (a successor is appointed, always with relation to you reset to zero).',
      'Against whole nations: INFLUENCE shifts public support or relations in a direction; STAGE_INCIDENT and BACK_CHANNEL target a front opponent (lowering or raising relations between the two countries respectively); FUND_COUP attempts to change a faction\'s regime; for STAGE_INCIDENT, BACK_CHANNEL, FUND_COUP and ASSASSINATE the amount you spend buys a better result (bigger heat rise, bigger relations gain, better odds, softer fallout) with diminishing returns and never a sure thing; BROKER strikes a direct contract past normal bidding, decided by the official\'s relation and integrity.',
      'An official\'s agenda can trigger a PolicyDecision if it is ignored for too long — anything from trade tariffs to an embargo against you. See a country\'s file to read an official\'s current agenda.',
    ],
  },
  {
    id: 'fronts',
    title: 'Fronts',
    summary: 'The wars that drive demand. Named formations fight over sectors; deliveries to a front strengthen that side; a breakthrough can redeploy formations between sectors.',
    body: [
      'Each front has two sides, named formations, and a position that moves between the two ends depending on who has the upper hand. Sector control (the colour on the map) is decided by which side has the most strength in that particular sector.',
      'Deliveries you make to a front strengthen the receiving side directly — the materiel is distributed to the formations there. A front can go to ceasefire (no fighting, no materiel need) if relations between the sides become good enough, or if doomsday forces peace.',
      'A clear breakthrough can make the winning side redeploy a formation into the sector the loser is weakest in — sector control can therefore change sides even between your own deliveries.',
      'A mauled formation (a cracked token on the map) has taken heavy losses and generates its own demand for replacement materiel — a named order tied to that specific formation.',
    ],
  },
] as const

export function findHandbookEntry(id: HandbookTopicId): HandbookEntry | null {
  return HANDBOOK.find((entry) => entry.id === id) ?? null
}

// actionCatalog.ts:s 22 verb, samma stavning — se filens huvudkommentar för
// resonemanget bakom varje mappning som inte är en direkt en-till-en-läsning
// av ett verbs egen kategori.
export const VERB_TOPIC: Readonly<Record<string, HandbookTopicId>> = {
  EXPAND: 'intelligence',
  WITHDRAW: 'intelligence',
  LEAK: 'intelligence',
  SABOTAGE: 'intelligence',
  TURN: 'intelligence',
  RECRUIT: 'intelligence',
  INFLUENCE: 'politics',
  STAGE_INCIDENT: 'politics',
  BACK_CHANNEL: 'politics',
  FUND_COUP: 'politics',
  BROKER: 'politics',
  BRIBE: 'politics',
  FUND_CAMPAIGN: 'politics',
  FAVOUR: 'politics',
  ASSASSINATE: 'politics',
  TAKE_LOAN: 'board',
  REPAY: 'board',
  BUILD_LINE: 'production',
  HIRE: 'production',
  REPRIORITISE_RND: 'production',
  BUY_FORWARD: 'production',
  RELEASE: 'production',
}

export function verbTopic(verb: string): HandbookTopicId | null {
  return VERB_TOPIC[verb] ?? null
}

// Shell.tsx:s HudBar — de tal som faktiskt visas (datestamp/turn är
// medvetet uteslutna, se filens huvudkommentar).
export type HudNumberId = 'doomsday' | 'treasury' | 'board' | 'debt' | 'creditLimit' | 'actionPoints'

export const HUD_NUMBERS: readonly HudNumberId[] = ['doomsday', 'treasury', 'board', 'debt', 'creditLimit', 'actionPoints']

export const HUD_NUMBER_TOPIC: Readonly<Record<HudNumberId, HandbookTopicId>> = {
  doomsday: 'doomsday',
  treasury: 'board',
  board: 'board',
  debt: 'board',
  creditLimit: 'board',
  actionPoints: 'board',
}

export function hudNumberTopic(id: HudNumberId): HandbookTopicId {
  return HUD_NUMBER_TOPIC[id]
}
