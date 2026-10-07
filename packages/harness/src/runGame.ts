// runGame — kör ett parti headless med en given policy till slut (ended-status
// eller scenariots turnCount) och samlar metrikerna avsnitt 7.3 kräver: ending,
// sluttur, kassa, doomsdayPeak, antal kontrakt, marknadsandel, bruttomarginal,
// andel turer med heat > 40. Plus de fem kolumnerna avsnitt 6.2 (P31) lägger
// till: rivalContractsWon, rivalAttributionShare, voidedContracts,
// retoolingTurns, stationsBurned — alla lästa direkt ur redan bokförda fält,
// ingen ny räknare i core.
//
// MAX_TURNS = 21, inte 20 — se ANDRINGSLOGG.md (loggat under P8): scenariots
// dueTurn/turnCount är 20 (0-indexerat), och endings.ts:s strikta dueTurn-kontroll
// kräver att draft.meta.turn FAKTISKT når 20 vid stegets start. Det kräver 21
// resolveTurn-anrop (tur 0..20), inte 20 — annars avgörs aldrig BUYOUT/
// SCENARIO_COMPLETE vid scenariots sista tur, bara tidigare slutvillkor.
//
// "Marknadsandel" och "bruttomarginal" saknar formel i specen — se
// ANDRINGSLOGG.md. marketSharePct läses av genom att räkna "WINS CONTRACT"-
// händelser i wire per tur (actorIsPlayer skiljer spelarens vinster från
// rivalernas — bidding.ts emittar alltid en sådan händelse för varje avgjord
// order, vunnen eller ej). grossMarginPct räknas EXAKT ur redan bokförda fält
// (unitCostAtSigning × unitsDelivered per kontrakt, mot husets kumulativa
// revenueByTurn) i stället för att uppskattas — ingen ny formel, bara en
// sammanställning av data som redan finns.
//
// rivalWinPct/disqualifiedRivalBidPct (ETAPP1_5_TEKNISK_SPEC.md avsnitt 2.2, P14)
// samma "läs av wire, uppfinn ingen ny räknare i core"-princip. rivalWinPct är
// rivalWins mot samma nämnare som marketSharePct (inte bara 100−marketSharePct:
// en order utan vinnare räknas i ingetdera). disqualifiedRivalBidPct nämnare är
// summan av order.competingRivals.length för varje order som avgörs en given
// tur (order.expiresTurn <= state.meta.turn INNAN resolveTurn anropas — samma
// villkor bidding.ts självt använder, se resolve/steps/bidding.ts) — det är
// exakt så många rivalbud bidding.ts försöker pröva den turen. En rival som
// saknas ur draft.rivals (finns inte i etapp 1,5) skulle göra denna nämnare en
// aning för hög; ingen sådan borttagning existerar ännu.
import { createInitialState, DESIGN_SPREAD, deriveSectorControl, freePlotSlots, getProduct, PLAYER_ATTRIBUTION_KEY, resolveTurn, runInDoublings } from '@seventh-front/core'
import type { GameState, TurnResult } from '@seventh-front/core'
import type { Policy } from './policies.js'
import { allLines } from '@seventh-front/core'
import { RunInTracker } from './runInShare.js'

export interface GameMetrics {
  policy: string
  seed: string
  ending: string
  finalTurn: number
  treasury: number
  doomsdayPeak: number
  contracts: number
  marketSharePct: number
  rivalWinPct: number
  disqualifiedRivalBidPct: number
  grossMarginPct: number
  heatOver40SharePct: number
  // P31 (ETAPP2_TEKNISK_SPEC.md avsnitt 6.2) — de fem kolumnerna som mäter det
  // etapp 2 faktiskt byggde (rivalkontrakt, kapacitetsstraff, EXPOSURE).
  rivalContractsWon: number
  rivalAttributionShare: number
  voidedContracts: number
  retoolingTurns: number
  stationsBurned: number
  // P75 (ETAPP7_TEKNISK_SPEC.md §2F/§13) — stillhetsmåtten beslut 2F väntar
  // på: hur mycket rör sig världen av sig själv, utan en förbandsförflyttnings-
  // mekanik? Jämförda turvis (state före/efter varje resolveTurn) och
  // summerade över hela partiet, ingen ny räknare i core — bara redan
  // existerande fält och queries.ts:s deriveSectorControl.
  sectorsChangedSide: number
  frontMovementTotal: number
  formationsChangedStatus: number
  factionsChangedAlignment: number
  officialsReplaced: number
  // P103 (ETAPP8_FORSLAG.md §7.1) — de fem kolumnerna balanspasset P104 mäter mot §7.2, alla lästa ur
  // redan bokförda fält (huvudboken, wire, status), ingen ny räknare i core. Plus submittedItems/
  // rejectedItems för P103:s klart-när ("avvisade handlingar över 5 %").
  advanceSharePct: number // förskott av alla intäkter (huvudbokens income.advances / summan av income)
  minTreasuryTurns1to6: number // lägsta kassa efter någon av turerna 0–5 (kvartal 1, före första granskningen)
  ceasefires: number // antal "CEASEFIRE ON THE …"-händelser
  standingOrderAlarms: number // larm från stående order (förlustavtal, övertidshaveri, aktiv station över brännsgränsen)
  buyoutReview: number // vilken granskning (1-baserat) BUYOUT inträffar vid, reviewTurns.length+1 = slutavräkningen; 0 om partiet inte slutar så
  submittedItems: number // bud + handlingar + stående orderändringar som policyn skickade in
  rejectedItems: number // av dem, de som resolveTurn avvisade
  // P129 (ETAPP9_FORSLAG.md §10) — kolumnerna för del A–E. Alla lästa ur slutläget eller ur wire-rubriker (samma teknik som
  // STANDING_ORDER_ALARMS), ingen ny räknare i core.
  designs: number // husets konstruktioner
  designBreakthroughs: number // konstruktioner vars dolda kvalitet ligger över det vanliga spannet kring den nominella (undre gräns — se kommentaren)
  casualties: number // "FIELD REPORT"-rubriker: olycksfåglar i fält
  battleProven: number // konstruktioner med fältrykte "stridsbeprövad"
  gapShocks: number // "GAP SHOCK"-rubriker (bägge blocken)
  firstInPlace: number // gånger HUSET var först på plats
  falseGapsCreated: number // LEAK mot en bedömning som policyn skickade in
  youngDesignRevenuePct: number // andel av konstruktionskontraktens intäkt som kom från konstruktioner yngre än fyra kvartal när kontraktet tecknades
  programmes: number // upphandlingar som utlysts under partiet
  programmesEntered: number // av dem, de husets anmälde sig till
  programmesWon: number // vunna (helt eller delat som förstaplats)
  programmesSplit: number // delade (huset fick 30 %-andelen)
  programmesLost: number // anmälda men förlorade
  traces: number // pappersspår som husets handlingar gav
  tracesSurfaced: number // av dem, de som kommit fram
  voidedByScandal: number // kontrakt hävda av en skandal ("CANCELS AFTER THE SCANDAL")
  suspensions: number // avstängningar från en köpares upphandlingar
  contractsWonViaProgramme: number // tilldelningar där huset var vinnare
  // P133 (§8b.2, §10): civil intäkt (huvudbokens income.civil) och dess andel av alla bokförda intäkter
  civilRevenue: number
  civilSharePct: number
  // P137 (del F): exportbrott (rubriker), licenser huset gav, licenstagare som blev rivaler, konstruktioner ur specialprojekt
  exportBreaches: number
  licencesGranted: number
  licenseeRivals: number
  skunkDesigns: number
  // P140 (ETAPP10_FORSLAG.md §5): fältrykte och de verb botarna nu använder. Alla lästa ur slutläget (state.house, state.programmes,
  // state.market) — ingen ny räknare i core.
  fieldOccasions: number // summan av fälttillfällen över husets konstruktioner (underlaget för fältrykteskvartilen, summary.ts)
  fieldTrials: number // FIELD_TRIAL: (konstruktion, köpare)-par som provats
  upgradedDesigns: number // uppgraderingar (Design.lineage satt)
  kitContracts: number // kontrakt som tecknats som uppgraderingssats (Bid.kit)
  studiedSystems: number // REVERSE_ENGINEER: studerade erövrade system
  lowballs: number // upphandlingar där huset spelat LOWBALL
  programmeSabotages: number // upphandlingar där huset sabotagerat eller läckt mot en deltagande rival
  rivalReports: number // anmälda rivaler i upphandlingar där huset deltog
  reportsConfirmed: number // P143: anmälningar som bekräftades (rivalen diskvalificerad)
  reportsFalse: number // P143: anmälningar som visade sig falska
  // P168 (ETAPP11_FORSLAG.md §9, "Grund") — nollläget före etapp 11: tar kapaciteten slut? Lästa ur allLines(state.house)/state.market.contracts
  // efter varje tur, ingen ny räknare i core.
  lineUtilizationPct: number // medel över spelade turer av andelen linjer med status 'running' (efter turens avgörande)
  peakLineUtilizationPct: number // den högsta enskilda turens andel
  linesBuilt: number // linjer huset byggt under partiet (slutantal minus startantal; BUILD_LINE är enda vägen)
  lateContracts: number // husets kontrakt som någon gång stod som 'late' (distinkta, även om de sedan levererades eller hävdes)
  // P182 (ETAPP11_FORSLAG.md §9) — kolumnerna för verken. Lästa ur slutläget och ur wire-rubriker (samma teknik som ovan), ingen ny räknare i core.
  worksBuilt: number // anläggningar huset har vid slutet utöver startpaketet (sålda och förlorade räknas av)
  worksBuiltKinds: string // vilka, per slag: "assembly:1|depot:1" (tom sträng = inga)
  worksExpansions: number // utbyggnader som påbörjats ("IS BEING EXPANDED")
  outsourcedSharePct: number // andel av husets kontraktskvantitet som en underleverantör byggt
  runInLevel: number // högsta inkörningsnivå (fördubblingar) någon linje nått under sin uppsättning, vid partiets slut
  strikes: number // strejker som brutit ut
  breakdowns: number // haverier (skick och övertid)
  stockValue: number // depåns bokförda värde vid slutet
  foreignWorksLost: number // verk utomlands som funnits men inte längre finns vid slutet (förlorade i kriget, förstatligade, sålda)
  operatingDecisionPct: number // andel spelade turer där policyn lade minst en driftsorder (verk, bemanning, underhåll, plan, utläggning, lager, ny linje) — en övre gräns för "driftsbeslut som ändrar utfallet"
  plotFull: number // 1 om hemmatomten var full efter någon tur före partiets slut, annars 0
  // P186: serier på minst åtta kvartal (en linje, samma produkt) och inkörningens andel av styckkostnadens fall i dem (runInShare.ts); 0 utan serier.
  runInSeries: number
  runInSharePct: number
}

// P140 (ETAPP10 §5 punkt 1, premiss 0.14): bara rubriken från traces.ts ("<HUS> IS SUSPENDED FROM TENDERING TO <KÖPARE> UNTIL TURN <n>")
// är en avstängning. Ett avvisat bud har nästan samma ord ("BID ON <order> DISQUALIFIED: <HUS> IS SUSPENDED FROM TENDERING TO <KÖPARE>",
// bidding.ts) men är en KONSEKVENS av en avstängning som redan räknats — tidigare räknades båda.
export function isSuspensionHeadline(headline: string): boolean {
  return !headline.startsWith('BID ON ') && headline.includes(' IS SUSPENDED FROM TENDERING TO ') && /UNTIL TURN \d+$/.test(headline)
}

// Rubrikmönstren för de tre larmen — grep:ade ordagrant ur emit()-anropen i standingOrders.ts,
// resolve/steps/production.ts och resolve/upkeep.ts (samma teknik som newsClassification.ts).
const STANDING_ORDER_ALARMS = [
  'HAS BEEN LOSING MONEY FOR',
  'BREAKS DOWN UNDER OVERTIME',
  'ON ACTIVE DUTY PASSES THE BURN THRESHOLD',
]

const MAX_TURNS = 21
const YOUNG_DESIGN_TURNS = 4 // §10: "konstruktioner yngre än fyra kvartal" — en tur är ett kvartal

// "assembly:1|depot:1" — slagen huset har vid slutet utöver startpaketets (multimängd-differens, i slagens ordning).
function builtKinds(initial: readonly string[], final: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const k of final) counts.set(k, (counts.get(k) ?? 0) + 1)
  for (const k of initial) counts.set(k, (counts.get(k) ?? 0) - 1)
  return [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, n]) => `${k}:${n}`)
    .join('|')
}

function outsourcedShare(state: GameState): number {
  const total = state.market.contracts.reduce((sum, c) => sum + c.quantity, 0)
  const built = state.market.contracts.reduce((sum, c) => sum + (c.outsource?.built ?? 0), 0)
  return total > 0 ? Math.min(100, (100 * built) / total) : 0
}

export function runGame(scenarioId: string, seed: string, policyName: string, policy: Policy): GameMetrics {
  let state: GameState = createInitialState(scenarioId, seed)
  let playerWins = 0
  let rivalWins = 0
  let rivalBidsAttempted = 0
  let rivalBidsDisqualified = 0
  let turnsWithHighHeat = 0
  let turnsPlayed = 0
  let retoolingLineTurns = 0
  // P75 — de fem stillhetsmåtten, ackumulerade en tur i taget.
  let sectorsChangedSide = 0
  let frontMovementTotal = 0
  let formationsChangedStatus = 0
  let factionsChangedAlignment = 0
  let officialsReplaced = 0
  // P103 — de fem nya kolumnerna.
  let minTreasury = Number.POSITIVE_INFINITY
  let ceasefires = 0
  let standingOrderAlarms = 0
  let submittedItems = 0
  let rejectedItems = 0
  // P129 — wire-räknare.
  let casualties = 0
  let gapShocks = 0
  let firstInPlace = 0
  let falseGapsCreated = 0
  let suspensions = 0
  let exportBreaches = 0
  let voidedByScandal = 0
  let reportsConfirmed = 0
  let reportsFalse = 0
  const programmeIds = new Set<string>()
  // P168 — linjeutnyttjande per tur och kontrakt som någon gång varit sena.
  const initialLineCount = allLines(state.house).length
  let utilisationSum = 0
  let utilisationPeak = 0
  const lateContractIds = new Set<string>()
  // P182 — verkens räknare.
  const initialWorks = state.house.works.map((w) => w.kind)
  let worksExpansions = 0
  let strikes = 0
  let breakdowns = 0
  let operatingDecisionTurns = 0
  let plotFull = 0
  const runInTracker = new RunInTracker()
  const foreignSeen = new Set<string>()
  // Kontrakt med en konstruktion: konstruktionens ålder (i turer) vid tecknandet, exakt — Contract har inget signeringsfält.
  const designContractAge = new Map<string, number>()
  const enteredIds = new Set<string>()

  for (let t = 0; t < MAX_TURNS; t++) {
    const decidingThisTurn = state.market.openOrders.filter((o) => o.expiresTurn <= state.meta.turn)
    for (const order of decidingThisTurn) rivalBidsAttempted += order.competingRivals.length

    const prevState = state
    const submission = policy(state)
    const result: TurnResult = resolveTurn(state, submission)
    submittedItems += submission.bids.length + submission.actions.length + submission.standingOrders.length
    rejectedItems += result.rejected.length
    for (const action of submission.actions) {
      const target = (action as { targetId?: string }).targetId
      if (action.type === 'INTEL' && typeof target === 'string' && target.startsWith('assessment:')) falseGapsCreated++
    }
    state = result.state
    for (const c of state.market.contracts) {
      if (!c.designId || designContractAge.has(c.id)) continue
      const d = (state.house.designs ?? []).find((x) => x.id === c.designId)
      if (d) designContractAge.set(c.id, state.meta.turn - d.introducedTurn)
    }
    turnsPlayed++
    const OPERATING_KINDS = ['WORKS', 'WORKFORCE', 'MAINTENANCE', 'PLAN', 'OUTSOURCE', 'STOCK']
    if (submission.standingOrders.some((c) => OPERATING_KINDS.includes(c.kind)) || submission.actions.some((a) => a.type === 'INTERNAL' && a.op === 'BUILD_LINE')) operatingDecisionTurns++
    for (const w of state.house.works) if (w.location !== undefined) foreignSeen.add(w.id)
    if (state.status.kind !== 'ended' && freePlotSlots(state.house) === 0) plotFull = 1
    runInTracker.observe(state)

    // P75 — jämför prevState (före denna resolveTurn) mot state (efter).
    // Fronter/förband matchas på id; en front eller ett förband som bara
    // finns på ena sidan (uppstod/försvann denna tur) räknas inte — bara
    // FAKTISKA ändringar hos något som fanns kvar mäts.
    for (const [frontId, nextFront] of Object.entries(state.fronts)) {
      const prevFront = prevState.fronts[frontId]
      if (!prevFront) continue
      frontMovementTotal += Math.abs(nextFront.position - prevFront.position)

      const prevControl = new Map(deriveSectorControl(prevState, prevFront).map((c) => [c.sectorId, c.side]))
      for (const control of deriveSectorControl(state, nextFront)) {
        const prevSide = prevControl.get(control.sectorId)
        if (prevSide !== undefined && prevSide !== control.side) sectorsChangedSide++
      }

      const prevFormationStatus = new Map(prevFront.formations.map((f) => [f.id, f.status]))
      for (const formation of nextFront.formations) {
        const prevStatus = prevFormationStatus.get(formation.id)
        if (prevStatus !== undefined && prevStatus !== formation.status) formationsChangedStatus++
      }
    }

    for (const [factionId, nextFaction] of Object.entries(state.factions)) {
      const prevFaction = prevState.factions[factionId]
      if (prevFaction && prevFaction.alignment !== nextFaction.alignment) factionsChangedAlignment++
    }

    // officialsReplaced: replaceOfficial (officials.ts) håller id/factionId/post
    // oförändrade och byter bara namn (+ integrity/agenda/standing m.m.) — ett
    // namnbyte på samma id ÄR en ersättning, den enda skrivaren till fältet.
    for (const [officialId, nextOfficial] of Object.entries(state.officials)) {
      const prevOfficial = prevState.officials[officialId]
      if (prevOfficial && prevOfficial.name !== nextOfficial.name) officialsReplaced++
    }

    if (t < 6) minTreasury = Math.min(minTreasury, state.house.treasury)
    for (const event of result.wire) {
      if (event.headline.startsWith('CEASEFIRE ON THE')) ceasefires++
      if (event.headline.startsWith('FIELD REPORT:')) casualties++
      if (event.headline.startsWith('GAP SHOCK:')) gapShocks++
      if (event.actorIsPlayer && event.headline.includes('IS BEING EXPANDED TO LEVEL')) worksExpansions++
      if (event.headline.startsWith('STRIKE AT ')) strikes++
      if (event.headline.includes(' BREAKS DOWN')) breakdowns++
      if (event.actorIsPlayer && event.headline.includes(' IS FIRST IN PLACE ')) firstInPlace++
      if (event.actorIsPlayer && isSuspensionHeadline(event.headline)) suspensions++
      if (event.actorIsPlayer && event.headline.startsWith('EXPORT CONTROL BREACHED')) exportBreaches++
      if (event.headline.startsWith('CONTRACT ') && event.headline.includes('CANCELS AFTER THE SCANDAL')) voidedByScandal++
      if (event.actorIsPlayer && event.headline.includes('IRREGULARITIES CONFIRMED')) reportsConfirmed++
      if (event.actorIsPlayer && event.headline.includes('PROVES FALSE')) reportsFalse++
      if (STANDING_ORDER_ALARMS.some((pattern) => event.headline.includes(pattern))) standingOrderAlarms++
      if (event.headline.includes('WINS CONTRACT')) {
        if (event.actorIsPlayer) playerWins++
        else rivalWins++
      } else if (event.headline.includes('DISQUALIFIED') && !event.actorIsPlayer) {
        rivalBidsDisqualified++
      }
    }
    if (Object.values(state.theatres).some((theatre) => theatre.heat > 40)) turnsWithHighHeat++
    // P31 (avsnitt 6.2, retoolingTurns): "antal turer linjer stod i omställning"
    // — en löpande summa, inte ett slutläge (en linje är 'retooling' bara i
    // retoolingTurns(1) balanstur innan den går tillbaka till 'idle').
    retoolingLineTurns += allLines(state.house).filter((l) => l.status === 'retooling').length
    const lineCount = allLines(state.house).length
    const utilisation = lineCount > 0 ? (100 * allLines(state.house).filter((l) => l.status === 'running').length) / lineCount : 0
    utilisationSum += utilisation
    utilisationPeak = Math.max(utilisationPeak, utilisation)
    for (const c of state.market.contracts) if (c.status === 'late') lateContractIds.add(c.id)

    if (state.status.kind === 'ended') break
  }

  const ledgerIncome = (state.ledger ?? []).reduce(
    (acc, e) => {
      acc.advances += e.income.advances
      acc.total += Object.values(e.income).reduce((a, b) => a + b, 0)
      return acc
    },
    { advances: 0, total: 0 },
  )
  // BUYOUT avgörs antingen vid en granskningstur (andra underkända i rad → granskningens 1-baserade
  // nummer) eller vid scenariots dueTurn när målet inte nåtts (slutavräkningen → reviewTurns.length + 1).
  const reviewTurns = state.house.boardTarget.reviewTurns
  const buyoutReview =
    state.status.kind === 'ended' && state.status.ending === 'BUYOUT'
      ? reviewTurns.includes(state.status.turn)
        ? reviewTurns.indexOf(state.status.turn) + 1
        : reviewTurns.length + 1
      : 0

  // P129 — slutlägesmått. Upphandlingar: alla som någon gång syns i state.programmes (ett avslutat blir kvar med result).
  const designs = state.house.designs ?? []
  const programmes = state.programmes ?? []
  for (const p of programmes) {
    programmeIds.add(p.id)
    if (p.entrants.some((e) => e.houseId === 'player')) enteredIds.add(p.id)
  }
  const wonProgrammes = programmes.filter((p) => p.result?.winner === 'player')
  const splitProgrammes = programmes.filter((p) => p.result?.split?.second === 'player')
  const lostProgrammes = programmes.filter(
    (p) => enteredIds.has(p.id) && p.result && p.result.winner !== 'player' && p.result.split?.second !== 'player',
  )
  const traces = (state.traces ?? []).filter((tr) => tr.houseId === 'player')
  const designById = new Map(designs.map((d) => [d.id, d]))
  let designRevenue = 0
  let youngRevenue = 0
  for (const c of state.market.contracts) {
    if (!c.designId) continue
    const d = designById.get(c.designId)
    const share = c.quantity > 0 ? (c.price * c.unitsDelivered) / c.quantity : 0
    designRevenue += share
    if (d && (designContractAge.get(c.id) ?? Number.POSITIVE_INFINITY) < YOUNG_DESIGN_TURNS) youngRevenue += share
  }

  const totalRevenue = state.house.revenueByTurn.reduce((sum, r) => sum + r, 0)
  const totalCost = state.market.contracts.reduce((sum, c) => sum + c.unitCostAtSigning * c.unitsDelivered, 0)
  const totalDecidedOrders = playerWins + rivalWins

  // P31 (avsnitt 6.2): de fem nya kolumnerna, alla lästa ur slutläget utom
  // retoolingTurns ovan (en löpande summa, se kommentaren i turloopen).
  const allRivalContracts = Object.values(state.rivals).flatMap((r) => r.contracts)
  const rivalContractsWon = allRivalContracts.filter((c) => c.status === 'fulfilled').length
  let attributedUnits = 0
  let rivalAttributedUnits = 0
  for (const front of Object.values(state.fronts)) {
    for (const [key, units] of Object.entries(front.attribution)) {
      attributedUnits += units
      if (key !== PLAYER_ATTRIBUTION_KEY) rivalAttributedUnits += units
    }
  }
  const voidedContracts =
    state.market.contracts.filter((c) => c.status === 'voided').length +
    allRivalContracts.filter((c) => c.status === 'voided').length
  const stationsBurned = state.house.stations.filter((s) => s.status === 'burned').length

  const runInResult = runInTracker.finish()
  return {
    policy: policyName,
    seed,
    ending: state.status.kind === 'ended' ? state.status.ending : 'ACTIVE',
    finalTurn: state.status.kind === 'ended' ? state.status.turn : state.meta.turn,
    treasury: state.house.treasury,
    doomsdayPeak: state.doomsdayPeak,
    contracts: state.market.contracts.length,
    marketSharePct: totalDecidedOrders > 0 ? (playerWins / totalDecidedOrders) * 100 : 0,
    rivalWinPct: totalDecidedOrders > 0 ? (rivalWins / totalDecidedOrders) * 100 : 0,
    disqualifiedRivalBidPct: rivalBidsAttempted > 0 ? (rivalBidsDisqualified / rivalBidsAttempted) * 100 : 0,
    grossMarginPct: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    heatOver40SharePct: turnsPlayed > 0 ? (turnsWithHighHeat / turnsPlayed) * 100 : 0,
    rivalContractsWon,
    rivalAttributionShare: attributedUnits > 0 ? (rivalAttributedUnits / attributedUnits) * 100 : 0,
    voidedContracts,
    retoolingTurns: retoolingLineTurns,
    stationsBurned,
    sectorsChangedSide,
    frontMovementTotal,
    formationsChangedStatus,
    factionsChangedAlignment,
    officialsReplaced,
    advanceSharePct: ledgerIncome.total > 0 ? (ledgerIncome.advances / ledgerIncome.total) * 100 : 0,
    minTreasuryTurns1to6: Number.isFinite(minTreasury) ? minTreasury : state.house.treasury,
    ceasefires,
    standingOrderAlarms,
    buyoutReview,
    submittedItems,
    rejectedItems,
    designs: designs.length,
    designBreakthroughs: designs.filter((d) => d.trueQuality - (d.performance + d.reliability) / 2 > DESIGN_SPREAD).length,
    casualties,
    battleProven: designs.filter((d) => d.fieldRecord.proven).length,
    gapShocks,
    firstInPlace,
    falseGapsCreated,
    youngDesignRevenuePct: designRevenue > 0 ? (youngRevenue / designRevenue) * 100 : 0,
    programmes: programmeIds.size,
    programmesEntered: enteredIds.size,
    programmesWon: wonProgrammes.length,
    programmesSplit: splitProgrammes.length,
    programmesLost: lostProgrammes.length,
    traces: traces.length,
    tracesSurfaced: traces.filter((tr) => tr.status !== 'open').length,
    voidedByScandal,
    reportsConfirmed,
    reportsFalse,
    suspensions,
    contractsWonViaProgramme: wonProgrammes.length,
    civilRevenue: (state.ledger ?? []).reduce((sum, e) => sum + (e.income.civil ?? 0), 0),
    exportBreaches,
    licencesGranted: (state.house.licences ?? []).length,
    licenseeRivals: Object.keys(state.rivals).filter((id) => id.startsWith('licensee-')).length,
    skunkDesigns: designs.filter((d) => d.skunk).length,
    fieldOccasions: designs.reduce((sum, d) => sum + d.fieldRecord.occasions, 0),
    fieldTrials: designs.reduce((sum, d) => sum + Object.keys(d.trials ?? {}).length, 0),
    upgradedDesigns: designs.filter((d) => d.lineage !== null).length,
    kitContracts: state.market.contracts.filter((c) => c.kit).length,
    studiedSystems: Object.keys(state.house.studiedSystems ?? {}).length,
    lowballs: programmes.filter((p) => p.entrants.some((e) => e.houseId === 'player' && e.lowball)).length,
    programmeSabotages: programmes.filter((p) => p.entrants.some((e) => e.houseId !== 'player' && (e.sabotaged || e.leaked))).length,
    rivalReports: programmes.filter((p) => enteredIds.has(p.id)).reduce((sum, p) => sum + p.entrants.filter((e) => e.houseId !== 'player' && e.reported).length, 0),
    lineUtilizationPct: turnsPlayed > 0 ? utilisationSum / turnsPlayed : 0,
    peakLineUtilizationPct: utilisationPeak,
    linesBuilt: allLines(state.house).length - initialLineCount,
    lateContracts: lateContractIds.size,
    worksBuilt: state.house.works.length - initialWorks.length,
    worksBuiltKinds: builtKinds(initialWorks, state.house.works.map((w) => w.kind)),
    worksExpansions,
    outsourcedSharePct: outsourcedShare(state),
    runInLevel: Math.max(0, ...allLines(state.house).map((l) => (l.tooling ? runInDoublings(l, getProduct(l.tooling.productId)) : 0))),
    strikes,
    breakdowns,
    stockValue: (state.house.stock ?? []).reduce((sum, item) => sum + item.bookValue, 0),
    foreignWorksLost: [...foreignSeen].filter((id) => !state.house.works.some((w) => w.id === id)).length,
    operatingDecisionPct: turnsPlayed > 0 ? (100 * operatingDecisionTurns) / turnsPlayed : 0,
    plotFull,
    runInSeries: runInResult.series,
    runInSharePct: runInResult.sharePct,
    civilSharePct: ledgerIncome.total > 0 ? ((state.ledger ?? []).reduce((sum, e) => sum + (e.income.civil ?? 0), 0) / ledgerIncome.total) * 100 : 0,
  }
}
