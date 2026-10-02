// exportRules.ts — P132 (ETAPP9_FORSLAG.md §8b.1, beslut 9I): exklusivitet och exportregler. Två regler, bägge lästa ur datan:
//
//  1. EXKLUSIVITET. Teknik som tagits fram med ett forskningsanslag i en utvecklingsupphandling (§8.1) binds till köparens block:
//     `Design.exclusiveTo`. Den kan inte bjudas till det andra blocket eller till neutrala köpare (avvisas i `bidDesignRejection` —
//     samma enda källa som bidding.ts, bidEstimate och playerWinCurve redan läser).
//  2. EXPORTLISTAN. En konstruktion på generation `exportControlGeneration` eller högre står på blockens exportlista (en fiktiv
//     motsvarighet till CoCom). Ett block- eller östanslutet hus som ändå vinner ett bud hos ett annat block bryter mot den: det ger
//     doomsday, heat i köparens teater och ett pappersspår (`illegalExport`, allvar `exportViolationTraceSeverity`) — risken för
//     upptäckt hanteras av P125:s spårmaskineri. Ett NEUTRALT hus undantas (det säljer till alla, med sämre villkor — beslut 9I).
import balanceData from './data/balance.json' with { type: 'json' }
import { blocOfFaction } from './race.js'
import { addDoomsday } from './resolve/doomsdayGate.js'
import { recordTrace } from './traces.js'
import type { ResolveContext } from './resolve/index.js'
import type { Bloc } from './race.js'
import type { Design, FactionId, GameState } from './types.js'

const BALANCE = balanceData as unknown as {
  exportControlGeneration: number
  exportViolationDoomsday: number
  exportViolationHeat: number
  exportViolationTraceSeverity: 1 | 2 | 3
}

// Sant när konstruktionen står på exportlistan.
export function isExportControlled(design: Pick<Design, 'generation'>): boolean {
  return design.generation >= BALANCE.exportControlGeneration
}

// Avvisningsorsaken för en exklusiv konstruktion mot en köpare i fel block (eller utan block), annars null.
export function exclusivityRejection(state: Pick<GameState, 'factions'>, design: Pick<Design, 'exclusiveTo'>, buyerId: FactionId): string | null {
  if (design.exclusiveTo === undefined) return null
  const buyerBloc = blocOfFaction(state, buyerId)
  if (buyerBloc === design.exclusiveTo) return null
  return `design bound to the ${design.exclusiveTo} by its research grant`
}

// Sant när ett bud/en leverans av konstruktionen till köparen bryter mot exportlistan (ett västanslutet hus säljer exportreglerad
// materiel österut, eller tvärtom). Ett neutralt hus och en köpare utan block ger aldrig ett brott.
export function isExportViolation(
  state: Pick<GameState, 'house' | 'factions'>,
  design: Pick<Design, 'generation'>,
  buyerId: FactionId,
): boolean {
  if (!isExportControlled(design)) return false
  const home = state.house.homeState
  if (home === 'neutral') return false
  const buyerBloc = blocOfFaction(state, buyerId)
  return buyerBloc !== null && buyerBloc !== home
}

// Binder konstruktionen till köparens block när upphandlingen hade ett forskningsanslag. En köpare utan block binder inget.
// Returnerar blocket om en bindning skedde (anroparen emitterar rubriken med rätt orsak).
export function bindDesignToGrantBloc(state: Pick<GameState, 'factions'>, design: Design, buyerId: FactionId, hadGrant: boolean): Bloc | null {
  if (!hadGrant || design.exclusiveTo !== undefined) return null
  const bloc = blocOfFaction(state, buyerId)
  if (bloc === null) return null
  design.exclusiveTo = bloc
  return bloc
}

// Konsekvenserna av ett exportbrott: doomsday, heat i köparens teater och ett pappersspår. Anropas när kontraktet tecknas.
export function applyExportViolation(ctx: ResolveContext, design: Design, buyerId: FactionId, contractId: string, causeId: string | null): void {
  const { draft, emit } = ctx
  const buyer = draft.factions[buyerId]
  const buyerName = buyer ? buyer.name.toUpperCase() : buyerId.toUpperCase()
  const front = Object.values(draft.fronts).find((f) => f.sideA === buyerId || f.sideB === buyerId)
  const theatre = front ? draft.theatres[front.theatreId] : undefined
  if (theatre) theatre.heat = Math.min(100, theatre.heat + BALANCE.exportViolationHeat)
  const id = emit({
    severity: 'headline',
    scope: 'house',
    headline: `EXPORT CONTROL BREACHED: ${draft.house.name.toUpperCase()} SELLS THE ${design.name.toUpperCase()} TO ${buyerName} ACROSS THE BLOC LINE`,
    causeId,
    delta: theatre ? { [`theatre.${theatre.id}.heat`]: BALANCE.exportViolationHeat } : {},
    actorIsPlayer: true,
    subjectId: buyerId,
  })
  addDoomsday(ctx, BALANCE.exportViolationDoomsday, id)
  recordTrace(ctx, { houseId: 'player', officialId: null, buyerId, kind: 'illegalExport', severity: BALANCE.exportViolationTraceSeverity, contractId }, id)
}
