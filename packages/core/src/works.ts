// works — P169 (ETAPP11_FORSLAG.md §3 11A, §4): anläggningarna. Produktionslinjerna bor i monteringsverk; det finns inga fristående linjer. All kod som förut läste
// `house.lines` läser nu linjerna genom `allLines` (alla verk, i verkens och linjernas ordning — samma ordning som den platta listan hade, så att produktionen
// bearbetar dem likadant). Kapaciteten per nivå och verkens form kommer ur data/facilities.json.
import facilitiesData from './data/facilities.json' with { type: 'json' }
import type { Facility, House, ProductionLine } from './types.js'

const DATA = facilitiesData as unknown as {
  interimStartLevel: 1 | 2 | 3
  interimWorksCount: number
  linesPerLevel: number[]
}

export const FACILITY_DATA = facilitiesData as unknown as {
  maxLevel: number
  plot: { slots: number; landSlots: number; landCost: number }
  kinds: Record<Facility['kind'], { label: string; does: string }>
}

type Lines = Pick<House, 'works'>

export function allLines(house: Lines): ProductionLine[] {
  return house.works.flatMap((w) => w.lines)
}

export function findLine(house: Lines, lineId: string): ProductionLine | undefined {
  for (const w of house.works) {
    const hit = w.lines.find((l) => l.id === lineId)
    if (hit) return hit
  }
  return undefined
}

export function assemblyWorks(house: Lines): Facility[] {
  return house.works.filter((w) => w.kind === 'assembly')
}

// Hur många linjer ett verk rymmer: bara monteringsverk rymmer några, och hur många följer nivån.
export function lineCapacity(works: Pick<Facility, 'kind' | 'level'>): number {
  return works.kind === 'assembly' ? (DATA.linesPerLevel[works.level - 1] ?? 0) : 0
}

export function freeLineSlots(works: Pick<Facility, 'kind' | 'level' | 'lines'>): number {
  return Math.max(0, lineCapacity(works) - works.lines.length)
}

export function newAssemblyWorks(id: string, lines: ProductionLine[], category: Facility['category'] = null): Facility {
  return { id, kind: 'assembly', level: DATA.interimStartLevel, category, condition: 100, staffing: 100, skill: 50, status: 'operating', lines, invested: 0 }
}

// Migreringen (11K) och startläget: linjerna delas i `interimWorksCount` monteringsverk, i ordning, den extra linjen i det första (fyra → två och två).
// Färre linjer än verk ger bara så många verk som det finns linjer; inga linjer ger tomma verk.
export function worksFromLines(lines: readonly ProductionLine[], category: Facility['category'] = null): Facility[] {
  const count = lines.length === 0 ? DATA.interimWorksCount : Math.min(DATA.interimWorksCount, lines.length)
  const result: Facility[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const remainingWorks = count - i
    const take = Math.ceil((lines.length - cursor) / remainingWorks)
    result.push(newAssemblyWorks(`works-${i + 1}`, lines.slice(cursor, cursor + take).map((l) => ({ ...l })), category))
    cursor += take
  }
  return result
}
