// knowledge — P176 (ETAPP11_FORSLAG.md §6): labb, ritkontor och provplats sätter tak för forskning, konstruktion och provning. Etapp 9:s regler för dem ändras inte — bara var de sker och hur mycket som
// ryms. Frågorna här är rena (ingen slump) och delas av validateAction, stående order, research och design. Tal i balance.json (laboratoryTechCap, designDesksPerLevel, provingChamberLevel,
// provingBasicEnvironment, robust*).
import balanceData from './data/balance.json' with { type: 'json' }
import type { DesignEnvironment, Facility, House, TechCategory } from './types.js'

const BALANCE = balanceData as unknown as {
  laboratoryTechCap: number[]
  designDesksPerLevel: number
  provingChamberLevel: number
  provingBasicEnvironment: DesignEnvironment
}

type Works = Pick<House, 'works'>

const inOperation = (w: Facility): boolean => w.status === 'operating'

// ── Laboratoriet ────────────────────────────────────────────────────────────────────────────────

export function laboratoryFor(house: Works, category: TechCategory): Facility | undefined {
  return house.works.find((w) => w.kind === 'laboratory' && w.category === category && inOperation(w))
}

// Högsta tekniknivå laboratoriet kan forska fram (nivå 1/2/3 → 6/8/10).
export function laboratoryTechCap(lab: Pick<Facility, 'level'>): number {
  return BALANCE.laboratoryTechCap[lab.level - 1] ?? 0
}

// Skälet till att ett forskningsprojekt (spår eller nytt krasprogram) inte kan startas i kategorin, annars null.
export function researchBlockedReason(house: Pick<House, 'works' | 'techLevel' | 'rnd'>, category: TechCategory): string | null {
  const lab = laboratoryFor(house, category)
  if (!lab) return `no laboratory in ${category}`
  if (house.techLevel[category] >= laboratoryTechCap(lab)) return `the ${category} laboratory cannot take research beyond tech level ${laboratoryTechCap(lab)}`
  const running = house.rnd.filter((p) => p.category === category && !p.design).length
  if (running >= lab.level) return `the ${category} laboratory is full`
  return null
}

// ── Ritkontoret ─────────────────────────────────────────────────────────────────────────────────

export function designOffice(house: Works): Facility | undefined {
  return house.works.find((w) => w.kind === 'design' && inOperation(w))
}

export const designDesks = (house: Works): number => {
  const office = designOffice(house)
  return office ? office.level * BALANCE.designDesksPerLevel : 0
}

// Skälet till att ett nytt designprojekt inte kan startas (inget kontor, eller alla bord upptagna), annars null.
export function designBlockedReason(house: Pick<House, 'works' | 'rnd'>): string | null {
  if (!designOffice(house)) return 'the house needs a design office in operation'
  const used = house.rnd.filter((p) => p.design).length
  if (used >= designDesks(house)) return 'every desk in the design office is taken'
  return null
}

// ── Provplatsen ─────────────────────────────────────────────────────────────────────────────────

export function provingGround(house: Works): Facility | undefined {
  return house.works.find((w) => w.kind === 'proving' && inOperation(w))
}

export const climateChamber = (house: Works): boolean => (provingGround(house)?.level ?? 0) >= BALANCE.provingChamberLevel

// Skälet till att en provning i egen regi inte kan sättas i miljön, annars null. `running` = antalet provningar som redan pågår (utom den som byts).
export function testingBlockedReason(house: Works, environment: DesignEnvironment, running: number): string | null {
  const ground = provingGround(house)
  if (!ground) return 'the house needs a proving ground in operation'
  if (environment !== BALANCE.provingBasicEnvironment && !climateChamber(house)) return `testing in ${environment} conditions needs a climate chamber (a level ${BALANCE.provingChamberLevel} proving ground)`
  if (running >= ground.level) return 'the proving ground is full'
  return null
}

// ── Kopplingen till verken ──────────────────────────────────────────────────────────────────────

// En konstruktion med inriktning 'robust' ritas för enkel tillverkning: omställningen går fortare och är billigare, och inkörningen går fortare.
export function isRobustDesign(house: Pick<House, 'designs'>, designId: string | null | undefined): boolean {
  return !!designId && (house.designs ?? []).some((d) => d.id === designId && d.focus === 'robust')
}
