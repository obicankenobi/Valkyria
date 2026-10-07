// designer.ts — P134 (ETAPP9_FORSLAG.md §8b.3, resterande del). Namngivna chefskonstruktörer: en person med en egenskap (snabb, noggrann eller
// sparsam) och en egen inriktning. De ger forskningen ett ansikte. Huset kan anställa en (stående order `DESIGNER HIRE`/`RELEASE`, ingen handling),
// och en konstruktör som en RIVAL anställer kan värvas över — dyrare. En rival kan i sin tur värva husets konstruktör: ett drag per tur med
// `designerPoachChancePct`, ur `ctx.rng` och bara medan huset HAR en konstruktör (så att partier utan konstruktör inte drar något slumptal).
//
// Egenskaperna läses av `newDesignProject` (snabb: −1 tur; sparsam: lägre kostnad) och `rollDesign` (noggrann: lägre bristrisk; ritar konstruktören
// i sin egen inriktning ger det ett litet kvalitetstillägg). Anställningen i sig kostar `designerSalaryPerTurn` per tur och en engångssumma.
import { designOffice } from './knowledge.js'
import balanceData from './data/balance.json' with { type: 'json' }
import designersData from './data/designers.json' with { type: 'json' }
import { recordExpense } from './ledger.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, DesignFocus, GameState, House, RivalId, StandingOrderChange, TechCategory } from './types.js'

const BALANCE = balanceData as unknown as {
  designerHireCost: number
  designerPoachFactor: number
  designerSalaryPerTurn: number
  designerFastTurnsSaved: number
  designerCarefulFlawReductionPct: number
  designerFrugalCostFactor: number
  designerFocusQualityBonus: number
  designerPoachChancePct: number
}

export type DesignerTrait = 'fast' | 'careful' | 'frugal'
export interface DesignerFile {
  id: string
  name: string
  trait: DesignerTrait
  focus: DesignFocus
  category: TechCategory
  employer: RivalId | null
}

export const DESIGNERS = designersData as unknown as Record<string, DesignerFile>
export const DESIGNER_TRAIT_TEXT: Record<DesignerTrait, string> = {
  fast: 'FAST — a project ends a quarter sooner',
  careful: 'CAREFUL — fewer hidden flaws',
  frugal: 'FRUGAL — cheaper projects',
}

// Vem som anställer konstruktören just nu: 'player', en rival eller ingen. Utelämnat i staten = datans ursprungliga arbetsgivare.
export function designerEmployer(state: Pick<GameState, 'designerMarket'>, designerId: string): 'player' | RivalId | null {
  const override = state.designerMarket?.[designerId]
  return override !== undefined ? override : (DESIGNERS[designerId]?.employer ?? null)
}

export const hiredDesigner = (house: Pick<House, 'designer'>): DesignerFile | null => (house.designer ? (DESIGNERS[house.designer.id] ?? null) : null)

export function hireCostFor(state: Pick<GameState, 'designerMarket'>, designerId: string): number {
  const employer = designerEmployer(state, designerId)
  return Math.round(BALANCE.designerHireCost * (employer !== null && employer !== 'player' ? BALANCE.designerPoachFactor : 1))
}

export function validateDesignerChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'DESIGNER' }>): ActionValidation {
  if (change.op === 'RELEASE') return draft.house.designer ? { ok: true } : { ok: false, reason: 'no chief designer to release' }
  if (!DESIGNERS[change.designerId]) return { ok: false, reason: 'unknown designer' }
  if (!designOffice(draft.house)) return { ok: false, reason: 'the chief designer needs a design office in operation' } // P176
  if (draft.house.designer) return { ok: false, reason: 'you already employ a chief designer' }
  if (designerEmployer(draft, change.designerId) === 'player') return { ok: false, reason: 'you already employ that designer' }
  if (draft.house.treasury < hireCostFor(draft, change.designerId)) return { ok: false, reason: 'cannot afford the signing fee' }
  return { ok: true }
}

export function applyDesignerChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'DESIGNER' }>): void {
  const { draft, emit } = ctx
  const house = draft.house
  if (change.op === 'RELEASE') {
    const file = hiredDesigner(house)!
    ;(draft.designerMarket ??= {})[file.id] = null
    delete house.designer
    emit({ severity: 'ticker', scope: 'house', headline: `${house.name.toUpperCase()} PARTS WITH ITS CHIEF DESIGNER ${file.name.toUpperCase()}`, causeId: null, delta: {}, actorIsPlayer: true, subjectId: null })
    return
  }
  const file = DESIGNERS[change.designerId]!
  const cost = hireCostFor(draft, file.id)
  const previous = designerEmployer(draft, file.id)
  house.treasury -= cost
  recordExpense(draft, 'hiring', cost)
  ;(draft.designerMarket ??= {})[file.id] = 'player'
  house.designer = { id: file.id, sinceTurn: draft.meta.turn }
  const rivalName = previous && previous !== 'player' ? (draft.rivals[previous]?.name ?? previous) : null
  emit({
    severity: 'headline',
    scope: 'house',
    headline: rivalName
      ? `${house.name.toUpperCase()} POACHES ${file.name.toUpperCase()} FROM ${rivalName.toUpperCase()} (−£${cost.toLocaleString('en-GB')})`
      : `${house.name.toUpperCase()} HIRES ${file.name.toUpperCase()} AS CHIEF DESIGNER (−£${cost.toLocaleString('en-GB')})`,
    causeId: null,
    delta: { treasury: -cost },
    actorIsPlayer: true,
    subjectId: null,
  })
}

// Varje tur: lönen, och en rivals chans att värva över konstruktören. Inget slumptal dras medan huset saknar konstruktör.
export function advanceDesigner(ctx: ResolveContext): void {
  const { draft, emit, rng } = ctx
  const house = draft.house
  const file = hiredDesigner(house)
  if (!file || house.designer!.sinceTurn >= draft.meta.turn) return
  const salary = BALANCE.designerSalaryPerTurn
  house.treasury -= salary
  recordExpense(draft, 'hiring', salary)
  const salaryId = emit({ severity: 'ticker', scope: 'house', headline: `${file.name.toUpperCase()} DRAWS A SALARY OF £${salary.toLocaleString('en-GB')}`, causeId: null, delta: { treasury: -salary }, actorIsPlayer: true, subjectId: null })
  if (!rng.chance(BALANCE.designerPoachChancePct)) return
  const rivals = Object.keys(draft.rivals)
  if (rivals.length === 0) return
  const rivalId = rng.pick(rivals)
  ;(draft.designerMarket ??= {})[file.id] = rivalId
  delete house.designer
  emit({
    severity: 'headline',
    scope: 'market',
    headline: `${(draft.rivals[rivalId]?.name ?? rivalId).toUpperCase()} POACHES ${file.name.toUpperCase()} FROM ${house.name.toUpperCase()}`,
    causeId: salaryId,
    delta: {},
    actorIsPlayer: false,
    subjectId: null,
  })
}

// Effekterna på ett designprojekt och dess utfall (läses av design.ts). Ritar konstruktören i sin egen kategori och inriktning ger det ett litet tillägg.
export const designerTurnsSaved = (house: Pick<House, 'designer'>): number => (hiredDesigner(house)?.trait === 'fast' ? BALANCE.designerFastTurnsSaved : 0)
export const designerCostFactor = (house: Pick<House, 'designer'>): number => (hiredDesigner(house)?.trait === 'frugal' ? BALANCE.designerFrugalCostFactor : 1)
export const designerFlawReductionPct = (house: Pick<House, 'designer'>): number => (hiredDesigner(house)?.trait === 'careful' ? BALANCE.designerCarefulFlawReductionPct : 0)
export function designerQualityBonus(house: Pick<House, 'designer'>, category: TechCategory, focus: DesignFocus): number {
  const file = hiredDesigner(house)
  return file && file.category === category && file.focus === focus ? BALANCE.designerFocusQualityBonus : 0
}
