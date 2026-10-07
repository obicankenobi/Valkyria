// designSheet.ts — P126 (ETAPP9_FORSLAG.md §9). Rena hjälpare åt ritbordet och typbladet: stämpeln ett typblad bär,
// klassetiketten med osäkerhet ("B ±1"), projektets framsteg och etiketterna. Ren och testbar — ingen state skrivs,
// och trueQuality/latentFlaw rörs aldrig här (designDisplay i core är den enda vägen till dem, skyddsräcke 5).
import type { Design, DesignAmbition, DesignEnvironment, DesignFocus, GameState, Investigation, QualityClass, RndProject, TechCategory } from '@seventh-front/core'

export type DesignStampKind = 'RECALLED' | 'UNDER REVIEW' | 'PROVEN IN THE FIELD' | 'UNTESTED'

interface StampInput {
  id: string
  status: 'active' | 'withdrawn'
  fieldRecord: { occasions: number; proven: boolean }
  testedIn: readonly DesignEnvironment[]
}

// En öppen eller förnekad utredning betyder att konstruktionen är under granskning.
export function openInvestigationsFor(designId: string, investigations: readonly Investigation[] | undefined): Investigation[] {
  return (investigations ?? []).filter((i) => i.designId === designId && (i.status === 'open' || i.status === 'denied'))
}

// Företräde: tillbakadragen > under granskning > beprövad i fält > ej provad. En konstruktion bär en stämpel åt gången.
export function designStamp(design: StampInput, investigations: readonly Investigation[] | undefined): DesignStampKind {
  if (design.status === 'withdrawn') return 'RECALLED'
  if (openInvestigationsFor(design.id, investigations).length > 0) return 'UNDER REVIEW'
  if (design.fieldRecord.proven) return 'PROVEN IN THE FIELD'
  return 'UNTESTED'
}

// "B ±1" — klassen med osäkerheten; utan osäkerhet bara klassen.
export function qualityLabel(q: { center: QualityClass; plusMinus: number }): string {
  return q.plusMinus > 0 ? `${q.center} ±${q.plusMinus}` : q.center
}

export function projectProgress(project: Pick<RndProject, 'turnsRemaining' | 'turnsTotal'>): number {
  if (project.turnsTotal <= 0) return 1
  return Math.max(0, Math.min(1, 1 - project.turnsRemaining / project.turnsTotal))
}

export const CATEGORY_NAME: Record<TechCategory, string> = {
  infantry: 'INFANTRY',
  artillery: 'ARTILLERY',
  armour: 'ARMOUR',
  aviation: 'AVIATION',
  naval: 'NAVAL',
  electronics: 'ELECTRONICS',
}

export const FOCUS_LABEL: Record<DesignFocus, string> = { robust: 'ROBUST', balanced: 'BALANCED', advanced: 'ADVANCED' }
export const FOCUS_HINT: Record<DesignFocus, string> = {
  robust: 'Cheap and dependable — modest numbers, few surprises.',
  balanced: 'A sound all-rounder.',
  advanced: 'Higher numbers, dearer to build, and likelier to hide a fault.',
}
export const AMBITION_LABEL: Record<DesignAmbition, string> = { timely: 'TIMELY', forward: 'FORWARD', ahead: 'AHEAD' }
export const AMBITION_HINT: Record<DesignAmbition, string> = {
  timely: 'Level with the current generation.',
  forward: 'A step past the current generation — longer, dearer, riskier.',
  ahead: 'Well ahead of its time — the longest, dearest and riskiest.',
}
export const ENVIRONMENT_LABEL: Record<DesignEnvironment, string> = { jungle: 'JUNGLE', monsoon: 'MONSOON', mine: 'MINES', wear: 'WEAR' }

// P146 (ETAPP10 §8 punkt 2): var konstruktionen står i kapplöpningen — först på plats hos ett block (huset eller en rival), eller en rivals måttstock den bedöms mot. Bara gällande anspråk
// (anspråkets generation är blockets nuvarande), samma villkor som race.ts:s currentClaim. Ren, ingen slump.
export interface DesignStanding {
  bloc: 'west' | 'east'
  kind: 'first' | 'yardstick'
  holder: string // husets namn eller rivalens
}

export function designStandings(
  state: { race: GameState['race']; house: Pick<GameState['house'], 'name'>; rivals: GameState['rivals'] },
  design: Pick<Design, 'category' | 'status'>,
): DesignStanding[] {
  const out: DesignStanding[] = []
  for (const bloc of ['west', 'east'] as const) {
    const claim = state.race.firstInPlace?.[bloc]?.[design.category]
    if (!claim || claim.generation !== (state.race.generation[bloc]?.[design.category] ?? 1)) continue
    if (claim.holder === 'player') out.push({ bloc, kind: 'first', holder: state.house.name })
    else out.push({ bloc, kind: 'yardstick', holder: state.rivals[claim.holder]?.name ?? claim.holder })
  }
  return out
}
