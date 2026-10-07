// outsourcing — P172 (ETAPP11_FORSLAG.md §4.2, §5.5, beslut 11E): underleverantörer. Ett kontrakt, eller en del av det (25/50/75/100 %), kan läggas ut. Det kostar mer per enhet,
// ger ingen inkörning och ger kvalitet i underkant; underleverantören kan bli sen, och då är det husets namn på kontraktet. Den som lägger ut för mycket för länge föder en
// konkurrent (som licenstagaren i P135). Ett monteringsverk med en kategori bygger bara den kategorin — ett kontrakt som inget verk kan bygga läggs ut av huset självt, så att det
// inte blir liggande; det är säkerhetsventilen när kapaciteten (eller kategorin) saknas.
import balanceData from './data/balance.json' with { type: 'json' }
import { designUnitCostFactor } from './design.js'
import { recordExpense } from './ledger.js'
import { round } from './money.js'
import { computeUnitCostNow, getProduct } from './pricing.js'
import { hasWorksFor, leadSupplierActive, maxOutsourcePct, subcontractCostFactorFor } from './leadSupplier.js'
import { blocOfFaction } from './race.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, Contract, FactionId, GameState, House, Money, Product, RivalHouse, Shipment, StandingOrderChange, TechCategory } from './types.js'
import { worksOfLine } from './works.js'

const BALANCE = balanceData as unknown as {
  subcontractUnitsFactor: number
  subcontractCostFactor: number
  subcontractDelayChancePct: number
  subcontractQualityPenalty: number
  subcontractRivalThreshold: number
  subcontractRivalCapital: number
  subcontractRivalMarketShare: number
  deliveryDelayMinTurns: number
  deliveryDelayMaxTurns: number
}

export const OUTSOURCE_SHARES: readonly number[] = [25, 50, 75, 100]
export const subcontractorRivalId = (category: TechCategory): string => `subcontractor-${category}`

export const isActiveContract = (c: Pick<Contract, 'status'> | undefined): boolean => !!c && (c.status === 'active' || c.status === 'late')

function unitsInTransit(shipments: readonly Shipment[], contractId: string): number {
  return shipments.filter((s) => s.contractId === contractId).reduce((sum, s) => sum + s.units, 0)
}

// Hur många enheter underleverantören ska bygga i kontraktet, och hur många som återstår för honom.
// sharePct 0 = utläggningen är återtagen: underleverantören bygger inte mer än det han redan byggt.
export function outsourceTarget(contract: Pick<Contract, 'quantity' | 'outsource'>): number {
  const out = contract.outsource
  if (!out) return 0
  return out.sharePct === 0 ? out.built : Math.ceil((contract.quantity * out.sharePct) / 100)
}

// Det som återstår för husets EGNA linjer: kvantiteten minus den utlagda delen minus det egna som redan tillverkats (levererat och på väg, utan underleverantörens enheter).
export function ownRemaining(contract: Pick<Contract, 'id' | 'quantity' | 'unitsDelivered' | 'outsource'>, shipments: readonly Shipment[]): number {
  const built = contract.outsource?.built ?? 0
  return contract.quantity - outsourceTarget(contract) - (contract.unitsDelivered + unitsInTransit(shipments, contract.id) - built)
}

function subcontractRemaining(contract: Contract): number {
  return outsourceTarget(contract) - (contract.outsource?.built ?? 0)
}

export function subcontractRate(product: Product): number {
  return Math.max(1, Math.floor(product.unitsPerLineTurn * BALANCE.subcontractUnitsFactor))
}

// Kan något av husets driftsatta monteringsverk bygga produkten? Ett verk utan kategori (migrerat) bygger allt; ett verk med kategori bara den.
export function canBuildHere(house: Pick<House, 'works'>, product: Pick<Product, 'category'>): boolean {
  return house.works.some((w) => w.kind === 'assembly' && (w.status === 'operating' || w.status === 'strike') && (w.category === null || w.category === product.category))
}

// Kostnadsfaktorn för vägen en order skulle gå: husets egna linjer (1) eller en underleverantör (subcontractCostFactor) när inget driftsatt verk kan bygga kategorin.
// Budmappen och kontraktets styckkostnad vid signering räknar med den — du känner din egen verkstad, och vet att en främmande kategori kostar mer att få gjord.
export function routeCostFactor(house: Pick<House, 'works'>, product: Pick<Product, 'category'>): number {
  return canBuildHere(house, product) ? 1 : subcontractCostFactorFor(house, product) // P185: den mjuka spärren lägger ett påslag på en order huset saknar verk för
}

// Får en linje (i verket den bor i) ta ett kontrakt i den här kategorin?
export function lineMayBuild(house: Pick<House, 'works'>, lineId: string, product: Pick<Product, 'category'>): boolean {
  const works = worksOfLine(house, lineId)
  return !!works && (works.category === null || works.category === product.category)
}

export function validateOutsourceChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'OUTSOURCE' }>): ActionValidation {
  const contract = draft.market.contracts.find((c) => c.id === change.contractId)
  if (!contract) return { ok: false, reason: 'unknown contract' }
  if (change.op === 'CANCEL') return contract.outsource && contract.outsource.sharePct > 0 ? { ok: true } : { ok: false, reason: 'that contract is not outsourced' }
  if (!isActiveContract(contract)) return { ok: false, reason: 'that contract needs no more production' }
  if (!OUTSOURCE_SHARES.includes(change.sharePct)) return { ok: false, reason: `outsource ${OUTSOURCE_SHARES.join(', ')} percent` }
  // P185 (11O): med ett verk i kategorin får högst hälften av kontraktet läggas ut.
  const cap = maxOutsourcePct(draft.house, getProduct(contract.productId))
  if (change.sharePct > cap) return { ok: false, reason: `At most ${cap} percent of a contract may be outsourced` }
  const produced = contract.unitsDelivered + unitsInTransit(draft.market.shipments, contract.id)
  if (Math.ceil((contract.quantity * change.sharePct) / 100) <= (contract.outsource?.built ?? 0)) return { ok: false, reason: 'the subcontractor has already built that much' }
  if (produced >= contract.quantity) return { ok: false, reason: 'that contract needs no more production' }
  return { ok: true }
}

export function applyOutsourceChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'OUTSOURCE' }>): void {
  const { draft, emit } = ctx
  const contract = draft.market.contracts.find((c) => c.id === change.contractId)!
  const from = draft.meta.turn + 1
  if (change.op === 'CANCEL') {
    if (contract.outsource && contract.outsource.built > 0) {
      // Det underleverantören redan byggt är byggt; resten tas tillbaka av husets linjer (sharePct 0 = bygger inte mer).
      contract.outsource = { sharePct: 0, auto: false, sinceTurn: contract.outsource.sinceTurn, built: contract.outsource.built }
    } else {
      delete contract.outsource
    }
    emit({ severity: 'ticker', scope: 'house', headline: `STANDING ORDER: ${contract.id.toUpperCase()} COMES BACK TO THE HOUSE'S OWN LINES (FROM NEXT QUARTER)`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: null })
    return
  }
  contract.outsource = { sharePct: change.sharePct, auto: false, sinceTurn: from, built: contract.outsource?.built ?? 0 }
  emit({
    severity: 'ticker',
    scope: 'house',
    headline: `STANDING ORDER: ${change.sharePct}% OF ${contract.id.toUpperCase()} GOES TO A SUBCONTRACTOR (FROM NEXT QUARTER)`,
    causeId: null,
    delta: {},
    actorIsPlayer: true,
    subjectId: null,
  })
}

// Ett kontrakt som inget driftsatt verk kan bygga läggs ut helt av huset självt, så att det inte blir liggande. Anropas före tilldelningen av linjer.
export function autoOutsource(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  for (const contract of draft.market.contracts) {
    if (!isActiveContract(contract) || contract.outsource) continue
    const product = getProduct(contract.productId)
    if (canBuildHere(draft.house, product)) continue
    // P185: ett verk i kategorin som blir klart inom ett kvartal — kontraktet väntar på det i stället för att läggas ut helt.
    if (leadSupplierActive() && hasWorksFor(draft.house, product.category)) continue
    contract.outsource = { sharePct: 100, auto: true, sinceTurn: draft.meta.turn, built: 0 }
    emit({
      severity: 'report',
      scope: 'house',
      headline: `NO WORKS CAN BUILD ${product.name.toUpperCase()} (${product.category.toUpperCase()}) — ${contract.id.toUpperCase()} GOES TO A SUBCONTRACTOR`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: null,
    })
  }
}

function spawnSubcontractorRival(draft: GameState, category: TechCategory, factionId: FactionId | null): RivalHouse {
  const relations: Record<FactionId, number> = {}
  for (const id of Object.keys(draft.factions)) relations[id] = id === factionId ? 60 : 25
  const rival: RivalHouse = {
    id: subcontractorRivalId(category),
    name: `${category.charAt(0).toUpperCase()}${category.slice(1)} Subcontractors Ltd`,
    specialisation: category,
    aggression: 55,
    temperament: 'opportunist',
    capital: BALANCE.subcontractRivalCapital,
    marketShare: BALANCE.subcontractRivalMarketShare,
    sabotagedUntilTurn: null,
    homeState: factionId ? (blocOfFaction(draft, factionId) ?? 'neutral') : 'neutral',
    relations,
    reputation: { quality: 50, reliability: 50 },
    contracts: [],
    supplyPlayCooldownUntilTurn: null,
  }
  draft.rivals[rival.id] = rival
  return rival
}

// Underleverantörerna bygger sina delar: en leverans per utlagt kontrakt och tur (om den inte blir sen), till högre styckkostnad och med sämre kvalitet.
export function runSubcontractors(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  const turn = draft.meta.turn
  for (const contract of draft.market.contracts) {
    const out = contract.outsource
    if (!out || out.sinceTurn > turn || !isActiveContract(contract)) continue
    const remaining = Math.min(subcontractRemaining(contract), contract.quantity - contract.unitsDelivered - unitsInTransit(draft.market.shipments, contract.id))
    if (remaining <= 0) continue
    const product = getProduct(contract.productId)
    if (rng.chance(BALANCE.subcontractDelayChancePct)) {
      emit({
        severity: 'report',
        scope: 'house',
        headline: `THE SUBCONTRACTOR ON ${contract.id.toUpperCase()} IS DELAYED — NOTHING DELIVERED THIS QUARTER (THE HOUSE'S NAME IS ON THE CONTRACT)`,
        causeId: null,
        delta: {},
        actorIsPlayer: false,
        subjectId: null,
      })
      continue
    }
    const planned = Math.min(remaining, subcontractRate(product))
    const unitCost = computeUnitCostNow(product, contract.grade, draft.market.commodities) * subcontractCostFactorFor(house, product) * designUnitCostFactor(house, contract.designId)
    const affordable = unitCost > 0 ? Math.floor(Math.max(0, house.treasury) / unitCost) : planned
    const units = Math.max(0, Math.min(planned, affordable))
    if (units <= 0) continue
    const cost: Money = Math.max(0, round(unitCost * units))
    house.treasury -= cost
    recordExpense(draft, 'production', cost)
    out.built += units
    draft.market.shipments.push({
      id: `shipment-${contract.id}-${turn}-sub`,
      contractId: contract.id,
      units,
      arrivalTurn: turn + rng.int(BALANCE.deliveryDelayMinTurns, BALANCE.deliveryDelayMaxTurns),
    })
    house.reputation.quality = Math.max(0, house.reputation.quality - BALANCE.subcontractQualityPenalty)
    const outsourced = (house.outsourcedCost ??= {})
    outsourced[product.category] = (outsourced[product.category] ?? 0) + cost
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `A SUBCONTRACTOR BUILDS ${units}× ${product.name.toUpperCase()} FOR ${contract.id.toUpperCase()} (−£${cost.toLocaleString('en-GB')}, QUALITY AT THE LOW END)`,
      causeId: null,
      delta: { treasury: -cost, 'reputation.quality': -BALANCE.subcontractQualityPenalty },
      actorIsPlayer: true,
      subjectId: null,
    })
    if ((outsourced[product.category] ?? 0) >= BALANCE.subcontractRivalThreshold && !draft.rivals[subcontractorRivalId(product.category)]) {
      const rival = spawnSubcontractorRival(draft, product.category, contract.buyerId)
      emit({
        severity: 'headline',
        scope: 'market',
        headline: `THE HOUSE'S SUBCONTRACTORS HAVE LEARNED THE TRADE — ${rival.name.toUpperCase()} ENTERS THE ${product.category.toUpperCase()} MARKET AS A RIVAL`,
        causeId: null,
        delta: { [`rivals.${rival.id}`]: 1 },
        actorIsPlayer: false,
        subjectId: null,
      })
    }
  }
}
// Pris är det enda en rival tar ut av en full orderbok (11L): se rivalLoadMarkup.
export function rivalLoadMarkup(activeContracts: number, capacity: number, markupPct: number): number {
  return activeContracts >= capacity ? 1 + markupPct / 100 : 1
}
