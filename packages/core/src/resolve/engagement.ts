// engagement — förbandens sammandrabbning. Se
// ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.3.
//
// INTE ett eget PIPELINE-steg (CLAUDE.md hård regel 7 rörs alltså inte) — P49:s
// egen instruktion säger uttryckligen "anropa det från fronts.ts, FÖRE dess egen
// aggregatberäkning", så engagement() anropas direkt från steps/fronts.ts:s
// resolveFront-passage, en funktion, inte ett registrerat steg. Formationerna
// löser sin egen strid FÖRST och skriver om aggregaten (steg 5, invarianten i
// 5.1) — fronts.ts:s befintliga formler (equipmentRatio m.m.) räknar sedan
// vidare på de UPPDATERADE aggregaten, samma tur. Samma stagnationsgrind som
// fronts.ts/attrition.ts redan använder (P43:s etablerade definition av "ingen
// strid": båda sidors artilleri 0) gäller redan i anropsplatsen — den här filen
// antar att den redan passerat.
//
// Tolkning (spec), motiverad: avsnitt 5.3:s formel skriver "D.supplyStress −
// A.supplyStress" som om formationerna (A/D) hade ett eget supplyStress-fält —
// avsnitt 5.2:s datamodel (P48, ordagrann) ger dem inget sådant. Läst som
// front.supplyStress[sida], EXAKT samma fält och samma differens som
// fronts.ts:s egen (redan committade) formel använder för sin aggregatversion
// (steps/fronts.ts: `front.supplyStress[defender] - front.supplyStress[attacker]`)
// — supplyStress är en front-/teaterbred belastning, ingen mekanik ger
// formationer en egen.
import balanceData from '../data/balance.json' with { type: 'json' }
import { ratioAdvantage } from './steps/fronts.js'
import type { ResolveContext } from './index.js'
import type { Formation, Front, TechCategory } from '../types.js'

interface Balance {
  categoryCombatWeight: Record<TechCategory, number>
  categoryVulnerability: Record<TechCategory, number>
  engagementAttritionPct: number
  readinessLossMultiplier: number
  maulThreshold: number
  destroyThreshold: number
  refitThreshold: number
  refittingReadinessRecoveryPerTurn: number
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Avsnitt 5.3, punkt 2, ordagrant.
function combatPower(f: Formation): number {
  const equipmentPower = TECH_CATEGORIES.reduce((sum, c) => sum + f.equipment[c] * BALANCE.categoryCombatWeight[c], 0)
  const strengthFactor = f.strengthAtFull > 0 ? f.strength / f.strengthAtFull : 0
  return equipmentPower * strengthFactor * (f.readiness / 100)
}

function byDescendingStrength(a: Formation, b: Formation): number {
  return b.strength - a.strength || a.id.localeCompare(b.id) // deterministisk tie-break, ingen RNG (hård regel 2)
}

export function engagement(front: Front, attacker: 'a' | 'b', defender: 'a' | 'b', emit: ResolveContext['emit']): void {
  // Nollställs varje tur (types.ts: "denna tur") innan parning — annars läcker
  // förra turens engagedWith in i den här turens reservberäkning.
  for (const f of front.formations) f.engagedWith = null

  // 1) Para ihop förband: anfallarens AKTIVA förband mot försvararens, störst
  // mot störst, oparade i reserv.
  const attackerActive = front.formations.filter((f) => f.side === attacker && f.status === 'active').sort(byDescendingStrength)
  const defenderActive = front.formations.filter((f) => f.side === defender && f.status === 'active').sort(byDescendingStrength)
  const pairCount = Math.min(attackerActive.length, defenderActive.length)

  for (let i = 0; i < pairCount; i++) {
    resolvePair(front, attacker, defender, attackerActive[i]!, defenderActive[i]!, emit)
  }

  // 4) mauled/refitting-övergångar för förband som INTE stred den här turen —
  // engagedWith === null täcker både reserven och alla förband som redan var
  // mauled/refitting före den här turen (aldrig parade, se filtret ovan). Ett
  // förband som just blev mauled i resolvePair har engagedWith satt och hoppar
  // därför över sin första "utan strid"-räkning till nästa tur, korrekt.
  for (const f of front.formations) {
    if (f.engagedWith !== null) continue
    advanceRecovery(f)
  }

  // 5) Aggregaten skrivs om ur förbanden, så invarianten i 5.1 håller.
  recomputeAggregates(front)
}

function resolvePair(
  front: Front,
  attackerSide: 'a' | 'b',
  defenderSide: 'a' | 'b',
  attackerFormation: Formation,
  defenderFormation: Formation,
  emit: ResolveContext['emit'],
): void {
  attackerFormation.engagedWith = defenderFormation.id
  defenderFormation.engagedWith = attackerFormation.id

  const pairAdvantageRaw =
    ratioAdvantage(combatPower(attackerFormation), combatPower(defenderFormation)) -
    front.terrainBonus / 100 +
    (front.supplyStress[defenderSide] - front.supplyStress[attackerSide]) / 100
  const pairAdvantage = clamp(pairAdvantageRaw, -1, 1)

  const attackerLossPct = BALANCE.engagementAttritionPct * (1 - pairAdvantage)
  const defenderLossPct = BALANCE.engagementAttritionPct * (1 + pairAdvantage)

  const engagementId = emit({
    severity: 'ticker',
    scope: 'front',
    headline: `${attackerFormation.name.toUpperCase()} ATTACKS ${defenderFormation.name.toUpperCase()} AT ${defenderFormation.sectorId.toUpperCase()}`,
    causeId: null,
    delta: {
      [`${attackerFormation.id}.strength`]: -Math.round(attackerFormation.strength * (attackerLossPct / 100)),
      [`${defenderFormation.id}.strength`]: -Math.round(defenderFormation.strength * (defenderLossPct / 100)),
    },
    actorIsPlayer: false,
    subjectId: front.id,
  })

  applyLosses(attackerFormation, attackerLossPct, engagementId, emit)
  applyLosses(defenderFormation, defenderLossPct, engagementId, emit)
}

// Avsnitt 5.3, punkt 3/4, ordagrant (utom statusövergångarna, som punkt 4 ger i
// prosa, inte formel).
function applyLosses(f: Formation, lossPct: number, causeId: string, emit: ResolveContext['emit']): void {
  const readinessBefore = f.readiness

  f.strength = Math.max(0, f.strength - Math.round(f.strength * (lossPct / 100)))
  for (const category of TECH_CATEGORIES) {
    const before = f.equipment[category]
    if (before <= 0) continue
    const loss = Math.round(before * (lossPct / 100) * BALANCE.categoryVulnerability[category])
    if (loss <= 0) continue
    f.equipment[category] = Math.max(0, before - loss)
  }
  f.readiness = clamp(f.readiness - lossPct * BALANCE.readinessLossMultiplier, 0, 100)

  // Destroyed prövas FÖRE mauled (starkare villkor, bara EN övergång per tur) —
  // ett förband under destroyThreshold är rimligen också under maulThreshold,
  // men det är utplåningen som ska vinna, inte en mellanliggande "mauled".
  if (f.strength < BALANCE.destroyThreshold) {
    f.status = 'destroyed'
    f.strength = 0
    for (const category of TECH_CATEGORIES) f.equipment[category] = 0
    f.turnsMauled = 0

    emit({
      severity: 'headline',
      scope: 'front',
      headline: `${f.name.toUpperCase()} DESTROYED — TAKEN OUT OF THE LINE`,
      causeId,
      delta: { strength: -f.strength },
      actorIsPlayer: false,
      subjectId: f.frontId,
    })
  } else if (f.readiness < BALANCE.maulThreshold && f.status !== 'mauled') {
    f.status = 'mauled'
    f.turnsMauled = 0

    emit({
      severity: 'headline',
      scope: 'front',
      headline: `${f.name.toUpperCase()} MAULED — READINESS ${Math.round(readinessBefore)} → ${Math.round(f.readiness)}`,
      causeId,
      delta: { readiness: f.readiness - readinessBefore },
      actorIsPlayer: false,
      subjectId: f.frontId,
    })
  }
}

// Avsnitt 5.3, punkt 4: "'mauled' utan strid i 2 turer → 'refitting' → 'active'
// när readiness > refitThreshold." Ingen mekanik ger readiness en väg uppåt
// under refitting i specens EGEN formel — nödvändigt tillägg (se ANDRINGSLOGG.md
// och balance.json:s _p49_note), annars fastnar varje mauled förband permanent
// (readiness < maulThreshold kan aldrig av sig själv passera refitThreshold).
function advanceRecovery(f: Formation): void {
  if (f.status === 'mauled') {
    f.turnsMauled += 1
    if (f.turnsMauled >= 2) {
      f.status = 'refitting'
      f.turnsMauled = 0
    }
  } else if (f.status === 'refitting') {
    f.readiness = Math.min(100, f.readiness + BALANCE.refittingReadinessRecoveryPerTurn)
    if (f.readiness > BALANCE.refitThreshold) {
      f.status = 'active'
    }
  }
}

function recomputeAggregates(front: Front): void {
  for (const side of ['a', 'b'] as const) {
    const sideFormations = front.formations.filter((f) => f.side === side)
    front.strength[side] = sideFormations.reduce((sum, f) => sum + f.strength, 0)
    for (const category of TECH_CATEGORIES) {
      front.equipment[side][category] = sideFormations.reduce((sum, f) => sum + f.equipment[category], 0)
    }
  }
}
