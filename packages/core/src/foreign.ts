// foreign — P177 (ETAPP11_FORSLAG.md §7, beslut 11G): verk i köparland. Huset kan bygga ett monteringsverk i ett köparland (platsen: data/foreignSites.json). Fördelar: lägre löner, kortare leveranser till landets
// egna kontrakt, bättre poäng i landets ordrar (mer hos en alliansfri tjänsteman) och ett motköp som blir verkligt (löftet i en upphandling uppfylls genom att fabriken byggs). Risker: kriget (ett verk i en sektor som
// byter sida är förlorat), regimskifte (fabriken kan förstatligas, och en kupp huset själv finansierat är en fråga för redbarheten), kunskapsspridning (landet lär sig och blir en rival, som en licenstagare) och
// exportreglerna från etapp 9. Alla tal i balance.json (foreign*, localWorks*, nationalisation*).
import balanceData from './data/balance.json' with { type: 'json' }
import sitesData from './data/foreignSites.json' with { type: 'json' }
import { recordExpense } from './ledger.js'
import { spawnLicenseeRival, licenceRivalId } from './licence.js'
import { blocOfFaction } from './race.js'
import { deriveSectorControl } from './queries.js'
import type { ResolveContext } from './resolve/index.js'
import type { Contract, Facility, FactionId, GameState, House, Order, StandingOrderChange } from './types.js'

const BALANCE = balanceData as unknown as {
  foreignMinRelation: number
  foreignWorksMax: number
  foreignBuildCostFactor: number
  foreignBuildExtraTurns: number
  foreignWageFactor: number
  foreignDeliveryTurnsSaved: number
  localWorksBidBonusPct: number
  localWorksNonAlignedFactor: number
  scoreBase: number
  foreignKnowledgePerTurn: number
  foreignKnowledgeThreshold: number
  foreignKnowledgeAfterSpawn: number
  nationalisationChancePct: number
  foreignCoupIntegrityPenalty: number
  foreignCounterPurchaseTurns: number
  foreignCounterPurchaseRelationBonus: number
  foreignCounterPurchaseRelationPenalty: number
  foreignCounterPurchaseFine: number
}

export interface ForeignSite {
  frontId: string
  sectorId: string
  side: 'a' | 'b'
  city: string
}
const SITES = sitesData as unknown as Record<string, ForeignSite | string>

export const FOREIGN_BUILD_COST_FACTOR = BALANCE.foreignBuildCostFactor
export const FOREIGN_BUILD_EXTRA_TURNS = BALANCE.foreignBuildExtraTurns

export function foreignSite(factionId: FactionId): ForeignSite | null {
  const site = SITES[factionId]
  return site && typeof site === 'object' ? site : null
}

export const foreignWorks = (house: Pick<House, 'works'>): Facility[] => house.works.filter((w) => w.location !== undefined)
export const homeWorks = (house: Pick<House, 'works'>): Facility[] => house.works.filter((w) => w.location === undefined)
export const foreignWorksIn = (house: Pick<House, 'works'>, factionId: FactionId): Facility | undefined => house.works.find((w) => w.location === factionId)

// Lönefaktorn för ett verk: utomlands är lönerna lägre.
export const foreignWageFactorOf = (facility: Pick<Facility, 'location'>): number => (facility.location !== undefined ? BALANCE.foreignWageFactor : 1)

// Ett kontrakts leverans från ett verk i köparens eget land anländer fortare.
export function foreignDeliveryTurnsSaved(house: Pick<House, 'works'>, lineId: string, contract: Pick<Contract, 'buyerId'>): number {
  const works = house.works.find((w) => w.lines.some((l) => l.id === lineId))
  return works?.location !== undefined && works.location === contract.buyerId ? BALANCE.foreignDeliveryTurnsSaved : 0
}

// Budtermen: ett verk i drift i köparens land ger poäng i landets ordrar (mer hos en NON_ALIGNMENT-tjänsteman). Efter computeScore, som övriga termer.
export function localWorksBidTerm(state: Pick<GameState, 'house' | 'officials'>, order: Pick<Order, 'buyerId' | 'officialId'>): number {
  const works = state.house.works.find((w) => w.location === order.buyerId && w.status === 'operating')
  if (!works) return 0
  const official = order.officialId ? state.officials[order.officialId] : undefined
  const factor = official?.agenda === 'NON_ALIGNMENT' ? BALANCE.localWorksNonAlignedFactor : 1
  return (BALANCE.scoreBase * BALANCE.localWorksBidBonusPct * factor) / 100
}

// Skälet till att huset inte kan bygga ett verk i landet, annars null (anropas av validateWorksChange för BUILD med `abroad`).
export function foreignBuildBlockedReason(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'WORKS'; op: 'BUILD' }>): string | null {
  const factionId = change.abroad!
  const faction = draft.factions[factionId]
  if (!faction || !foreignSite(factionId)) return 'no works can be built in that country'
  if (change.facilityKind !== 'assembly') return 'only an assembly works can be built abroad'
  if (faction.bankrupt) return 'the country is bankrupt'
  if (faction.embargoed) return 'the country is under embargo'
  if (faction.relationToPlayer < BALANCE.foreignMinRelation) return `the country's relation to the house is below ${BALANCE.foreignMinRelation}`
  if (foreignWorksIn(draft.house, factionId)) return 'the house already has works in that country'
  if (foreignWorks(draft.house).length >= BALANCE.foreignWorksMax) return `the house may have at most ${BALANCE.foreignWorksMax} works abroad`
  // Exportreglerna (etapp 9): ett väst- eller östanslutet hus bygger inte i ett land i det andra blocket; neutrala hus är undantagna.
  const home = draft.house.homeState
  const host = blocOfFaction(draft, factionId)
  if (home !== 'neutral' && host !== null && host !== home) return 'the export rules forbid building in a country of the other bloc'
  return null
}

// Verket är byggt/ska byggas i ett land: sparar landets alignment (för att se ett regimskifte) i facility.hostAlignment.
export function hostAlignmentOf(draft: Pick<GameState, 'factions'>, factionId: FactionId): number {
  return draft.factions[factionId]?.alignment ?? 0
}

// Per tur: förlorade verk (krig, förstatligande), kunskapsspridning och motköpens frister. Anropas sist i `production`.
export function advanceForeignWorks(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  if (foreignWorks(house).length === 0 && !draft.market.contracts.some((c) => c.counterPurchase?.status === 'open')) return
  const turn = draft.meta.turn

  for (const works of [...foreignWorks(house)]) {
    if (works.status === 'under_construction') continue
    const factionId = works.location!
    const faction = draft.factions[factionId]
    const site = foreignSite(factionId)
    if (!faction || !site) continue
    const city = site.city.toUpperCase()

    // 1) Kriget: sektorn hålls av motsidan → verket är förlorat med allt som står i det.
    const front = draft.fronts[site.frontId]
    const control = front ? deriveSectorControl(draft, front).find((c) => c.sectorId === site.sectorId) : undefined
    const enemy = site.side === 'a' ? 'b' : 'a'
    if (control && control.side === enemy) {
      loseWorks(ctx, works, `THE ${site.sectorId.toUpperCase().replace(/-/g, ' ')} SECTOR HAS FALLEN — THE HOUSE'S WORKS AT ${city} IS LOST, WITH EVERYTHING IN IT`)
      continue
    }

    // 2) Regimskifte: landets alignment byter tecken. En slumpdragning (ctx.rng) bara då.
    const seen = works.hostAlignment ?? faction.alignment
    if (Math.sign(seen) !== Math.sign(faction.alignment) && Math.sign(faction.alignment) !== 0) {
      works.hostAlignment = faction.alignment
      if (faction.coupAttempted) {
        house.reputation.integrity = Math.max(0, house.reputation.integrity - BALANCE.foreignCoupIntegrityPenalty)
        emit({
          severity: 'headline',
          scope: 'house',
          headline: `${faction.name.toUpperCase()} CHANGES SIDES AFTER A COUP THE HOUSE PAID FOR — AND THE HOUSE OWNS A FACTORY AT ${city}. THE PRESS ASKS QUESTIONS (INTEGRITY −${BALANCE.foreignCoupIntegrityPenalty})`,
          causeId: null,
          delta: { 'reputation.integrity': -BALANCE.foreignCoupIntegrityPenalty },
          actorIsPlayer: false,
          subjectId: factionId,
        })
      }
      const chance = BALANCE.nationalisationChancePct * (1 - Math.max(0, Math.min(100, faction.relationToPlayer)) / 100)
      if (rng.chance(chance)) {
        loseWorks(ctx, works, `THE NEW REGIME IN ${faction.name.toUpperCase()} NATIONALISES THE HOUSE'S WORKS AT ${city}`)
        continue
      }
      emit({
        severity: 'report',
        scope: 'house',
        headline: `THE NEW REGIME IN ${faction.name.toUpperCase()} LEAVES THE HOUSE'S WORKS AT ${city} ALONE — FOR NOW`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: factionId,
      })
    } else if (works.hostAlignment === undefined) {
      works.hostAlignment = faction.alignment
    }

    // 3) Kunskapsspridning: arbetsstyrkan lär sig; vid tröskeln börjar landet tillverka själv.
    if (works.status === 'operating') {
      works.localKnowledge = (works.localKnowledge ?? 0) + BALANCE.foreignKnowledgePerTurn
      if (works.localKnowledge >= BALANCE.foreignKnowledgeThreshold && !draft.rivals[licenceRivalId(factionId)]) {
        const rival = spawnLicenseeRival(draft, factionId, works.category ?? house.specialisation)
        works.localKnowledge = BALANCE.foreignKnowledgeAfterSpawn
        emit({
          severity: 'headline',
          scope: 'market',
          headline: `THE WORKFORCE AT ${city} HAS LEARNED THE TRADE — ${faction.name.toUpperCase()} BEGINS TO BUILD ON ITS OWN: ${rival.name.toUpperCase()} ENTERS THE MARKET AS A RIVAL`,
          causeId: null,
          delta: { [`rivals.${rival.id}`]: 1 },
          actorIsPlayer: false,
          subjectId: factionId,
        })
      }
    }
  }

  // 4) Motköpens frister: ett löfte om lokal tillverkning uppfylls av ett verk i drift i köparens land.
  for (const contract of draft.market.contracts) {
    const pledge = contract.counterPurchase
    if (!pledge || pledge.status !== 'open') continue
    const buyer = draft.factions[contract.buyerId]
    const works = foreignWorksIn(house, contract.buyerId)
    if (works && works.status === 'operating') {
      pledge.status = 'met'
      if (buyer) buyer.relationToPlayer = Math.min(100, buyer.relationToPlayer + BALANCE.foreignCounterPurchaseRelationBonus)
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `THE COUNTER-PURCHASE ON ${contract.id.toUpperCase()} IS KEPT: THE FACTORY STANDS IN ${buyer ? buyer.name.toUpperCase() : contract.buyerId.toUpperCase()} (RELATION +${BALANCE.foreignCounterPurchaseRelationBonus})`,
        causeId: null,
        delta: { relationToPlayer: BALANCE.foreignCounterPurchaseRelationBonus },
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
    } else if (turn > pledge.dueTurn) {
      pledge.status = 'breached'
      if (buyer) buyer.relationToPlayer = Math.max(0, buyer.relationToPlayer - BALANCE.foreignCounterPurchaseRelationPenalty)
      house.treasury -= BALANCE.foreignCounterPurchaseFine
      recordExpense(draft, 'fixedCosts', BALANCE.foreignCounterPurchaseFine)
      emit({
        severity: 'headline',
        scope: 'house',
        headline: `THE HOUSE HAS NOT BUILT THE PROMISED FACTORY IN ${buyer ? buyer.name.toUpperCase() : contract.buyerId.toUpperCase()} — THE COUNTER-PURCHASE ON ${contract.id.toUpperCase()} IS BROKEN: PENALTY £${BALANCE.foreignCounterPurchaseFine.toLocaleString('en-GB')}, RELATION −${BALANCE.foreignCounterPurchaseRelationPenalty}`,
        causeId: null,
        delta: { treasury: -BALANCE.foreignCounterPurchaseFine, relationToPlayer: -BALANCE.foreignCounterPurchaseRelationPenalty },
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
    }
  }
}

// Ett verk försvinner med allt i det: linjerna, deras stående order och planer.
function loseWorks(ctx: ResolveContext, works: Facility, headline: string): void {
  const { draft, emit } = ctx
  const house = draft.house
  house.works = house.works.filter((w) => w !== works)
  for (const line of works.lines) {
    delete house.standingOrders.lines[line.id]
    delete house.standingOrders.plan?.[line.id]
  }
  emit({ severity: 'headline', scope: 'house', headline, causeId: null, delta: { facilitiesLost: 1 }, actorIsPlayer: false, subjectId: works.location ?? null })
}

// Ett motköp i en upphandling blir ett löfte om lokal tillverkning (anropas av programme.ts när ett kontrakt tecknats med ett motköp).
export function counterPurchasePledge(turn: number): NonNullable<Contract['counterPurchase']> {
  return { dueTurn: turn + BALANCE.foreignCounterPurchaseTurns, status: 'open' }
}
