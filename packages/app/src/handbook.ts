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
// actionCatalog.ts:s verb (22 + etapp 9:s FIELD_TRIAL och REVERSE_ENGINEER) och en handhållen HUD_NUMBERS-lista.
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
export type HandbookTopicId = 'procurement' | 'production' | 'board' | 'doomsday' | 'heat' | 'intelligence' | 'politics' | 'fronts' | 'design' | 'programmes' | 'state' | 'works'

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
      'THE COMPANY shows your lines\' status, the house\'s fixed costs, and interest on debt. BUILD_LINE builds a new line (a one-off investment); HIRE hires staff who raise throughput or research speed; REPRIORITISE_RND is a crash programme in one tech category: half the time, double the total cost, and the house cannot bid in that category next quarter. Steady research is a research track (a standing order with a low, normal or high pace) — it costs no action and runs on its own.',
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
    summary: 'A station in a country gives you depth there — insight into its formations and price bands, and unlocks five verbs: EXPAND, WITHDRAW, LEAK, SABOTAGE and TURN. RECRUIT is how you open a station in the first place, and REOPEN wakes a dormant one.',
    body: [
      'A station in a country gives you intelligence depth there, from 0 to 5. Formations are unknown at depth 0 — a country with no station, or a station that is still new — and show as a dashed frame with a question mark on the map; from depth 1 they are named and counted. Each level also narrows the price bands on that buyer\'s orders, down to an exact band at depth 5. RECRUIT opens a new station at depth 0 (you can hold five); EXPAND adds one depth level for a fee; WITHDRAW puts a station to sleep — a dormant station gives no insight, still counts toward the five and still costs upkeep, but its exposure cools off each turn; REOPEN wakes it again for a fee, with its depth and coverage intact.',
      'Officials are partly visible without any station: you always see an official\'s name, post, standing and relation to you. Their integrity and agenda are shown only when an active station there covers the cabinet. Every station covers procurement; depth adds more — military coverage at depth 2, industry at depth 3 and cabinet at depth 4. Military and industry coverage both sharpen your estimate of the blocs\' arms race; cabinet coverage is what shows integrity and agenda.',
      'LEAK damages a chosen rival\'s relations with a nation by leaking harmful information. SABOTAGE takes a rival out of contention for deliveries for a time. TURN targets a single official — success raises your relation to that person, failure damages their standing.',
      'All intelligence operations share a success chance that is scaled down by the target\'s counterIntelligence — the better the opponent\'s counter-espionage, the harder it is to succeed, and the greater the risk of being caught.',
      'A station exposed too much risks being burned (a pulsing ring on the map warns in advance) — a burned station is lost, and RECRUIT opens a new one at depth 0.',
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
  {
    id: 'design',
    title: 'The Drawing Board',
    summary: 'Your own designs: pick a focus and an ambition, wait for the drawing, then test it. A design\'s true quality is hidden — the type sheet shows only a class with a margin, such as "B ±1".',
    body: [
      'On the drawing board (THE COMPANY) you start one design project per category. The focus decides the house style — robust and cheap, balanced, or advanced. The ambition decides how far past the current generation you reach: a step further gives better numbers but takes longer, costs more per quarter and carries a bigger risk of a hidden fault. Starting a project is a standing order — it costs no action.',
      'A finished design gets a type sheet: performance, reliability and unit cost are shown, but its true quality is hidden behind a class with a margin ("B ±1"). Testing in your own shop (a standing order, it costs money and time) narrows the margin. Some faults belong to one environment — jungle, monsoon, mines or hard wear — and only show when you test in the right one, or when the design reaches a front that has it.',
      'A stamp on the sheet shows where the design stands: UNTESTED, PROVEN IN THE FIELD (it has fought and held), UNDER REVIEW (an inquiry is open after a field report) or RECALLED (withdrawn for a redesign). An inquiry has three answers: fix the fault in the field, deny it (cheap now, but it can come out later), or redesign.',
      'FIELD_TRIAL lets a buyer test your design at your cost: the margin narrows, a fault may surface, the buyer favours it in their next procurement — and the result becomes known to every rival. REVERSE_ENGINEER studies captured enemy materiel and gives a head start on research in that category.',
    ],
  },
  {
    id: 'programmes',
    title: 'Development Procurements & the Paper Trail',
    summary: 'A ministry puts out a call for tenders; houses draw to one requirement sheet, prototypes are tested side by side, and the best protocol wins the series. Every dirty move leaves a file.',
    body: [
      'A procurement runs through five phases: call for tenders (the requirements are a draft and can be influenced), requirements locked, development, a comparative trial in the buyer\'s own conditions, and the award. Entering, submitting a prototype and withdrawing cost no action. Your home state decides which ministries you may enter.',
      'The trial produces an evaluation protocol — one line per requirement with the measured value. A failed MUST disqualifies; a failed SHOULD only costs marks. If the runner-up is close the ministry may split the series.',
      'PROCUREMENT moves cost one action each: a counter-purchase (legal), writing the requirements, a hand-built test article, bribing the test board, falsifying the protocol, and a low-ball bid (a grey zone). Rivals cheat too — with intelligence in the buyer\'s country you can report one, and if you are right it is disqualified; if you are wrong your relation falls.',
      'Every corrupt act — these, a bribe in a bid, BRIBE, BROKER and FAVOUR — leaves a file. Each quarter an open file may come to light, likelier the longer it lies, the more compromised the official and the better the buyer\'s counter-intelligence. An inquiry then gives three bad answers: deny it, sacrifice a director, or settle. The consequences grow with the gravity: your probity falls, a contract can be voided, you can be suspended from the buyer, the official can fall — and the board deducts at the next review. Legal counsel lowers the odds, and leaves a small file of its own. A coup opens the archives of the old regime.',
    ],
  },
  {
    id: 'state',
    title: 'The House and the State: Exports, Civil Lines, Licences',
    summary: 'Research done on a state grant belongs to its bloc, advanced designs are on the export list, peacetime trade does not depend on the war, and a licence teaches your customer to build it itself.',
    body: [
      'A design that won a procurement with a research grant is bound to the buyer\'s bloc: it cannot be offered to the other bloc or to non-aligned buyers. A design of generation 2 or higher is on the export list — if a house of one bloc sells it across the line, it breaches the list: doomsday rises, heat builds in the buyer\'s theatre and a paper trail is left. A neutral house is exempt.',
      'A civil line (tractors from armour, radio sets from electronics, transport helicopters from aviation) needs tech level 5 in the category. It pays a small, steady sum every quarter whatever the war does — it keeps paying through a ceasefire — and feeds a head start back into research. A special project on the drawing board (skunk works) is faster and dearer, but with less oversight the risk of a hidden flaw is higher.',
      'A chief designer is a named person with a trait — fast, careful or frugal — and a focus of their own; hire one on the drawing board (a rival\'s designer can be poached, at twice the fee, and a rival may poach yours). A bid can be customised to the buyer: dearer to build, a better mark in the scoring — and if it wins there is a one-in-five risk of a scandal at the buyer that halves the order. A licence gives a lump sum and a royalty every quarter, but the licensee learns the design. An embargoed state learns twice as fast, and when it has learnt enough it stops paying and builds on its own — a new rival on your markets. Revoke a licence in time if you do not want one.',
    ],
  },
  {
    id: 'works',
    title: 'The Works',
    summary: 'Your plot holds buildings — assembly works, a laboratory, a design office and more. A lamp shows whether each one runs, stands or is being built. Tap a building for its card, a free plot to build.',
    body: [
      'THE COMPANY has four drawers: Works (the plot and the production board), Drawing office (the drawing board, type sheets and research), Books (balance sheet, board target and ledger) and Legal (the paper trail).',
      'The plot has eight places, one building each — a building under construction takes its place at once. More land costs £2,400,000 once and adds four places. Tap a free place to build: choose a kind, a category for assembly works and laboratories, and a pace. A forced build takes half the time and costs double. Building is a standing order: it costs no action, starts next quarter, and the cost is paid in instalments.',
      'A building\'s card says what it does, its level, condition, staff, fixed cost and what the next level gives. An assembly works holds two production lines on level 1, four on level 2 and six on level 3, and wears with use; maintenance low saves money and wears the machines, high builds the condition back, and a modernisation fits new machine tools. Staffing is 25, 50, 75 or 100 percent of full strength: hiring takes a quarter and dilutes skill, laying off saves wages but costs skill and morale. Below 35 morale a strike can break out — give in, or break it.',
      'The production board shows one track per line over the next six quarters: the contracts being built, retooling (hatched) and free time. Tap a contract to put it on a line — a planned contract is built first, in the order of the plan — or to give a share of it (25, 50, 75 or 100 percent) to a subcontractor. In the bid folder, "Ready by" shows when an order could be finished with today\'s plan, and which waiting contracts it would push past their deadline.',
      'An assembly works can be built in a buyer\'s country: lower wages, quicker deliveries and a better score with that buyer, and a counter-purchase pledge becomes real. The works shows on the map in its sector. The risks are the war (a sector that changes sides takes the works with it), nationalisation after a coup, and the country learning what your workers know.',
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
  REOPEN: 'intelligence',
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
  FIELD_TRIAL: 'design',
  REVERSE_ENGINEER: 'design',
  PROCUREMENT: 'programmes',
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
