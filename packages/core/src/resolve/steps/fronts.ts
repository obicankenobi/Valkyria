// fronts — frontresolve: materielkvot, manskapskvot, terräng, försörjningsstress,
// moral, position, attribution per levererande hus. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 5 ("Front").
//
// Attribution skrivs INTE här — den bokförs redan vid leveranstillfället i
// deliveries.ts (P5, utökad för P6), eftersom Front.attribution kommenteras i
// types.ts som "levererade enheter" och den bokföringen inte beror av någon
// stridsutkomst. Det den här filen faktiskt gör är den enda formel specen ger
// (equipmentRatio) plus PROVISORISK, uttryckligen flaggad logik för allt annat
// avsnitt 5 bara nämner i löpande text utan formel: manpowerRatio, förlustfördelning,
// moralskifte, positionsflytt vid genombrott. Se docs/ANDRINGSLOGG.md — det här är
// den enskilt minst specificerade delen av hela etapp 1, och bör granskas av någon
// med ett designbeslut att fatta, inte bara av P10:s balanspass.
//
// En front utan materiel på NÅGON sida stagnerar helt (P6 klart-när) — ingen
// beräkning görs alls för den, inte bara "position rör sig inte". Det är den
// säkraste läsningen av "stagnerar" och kräver inget särfall i formlerna nedan.
//
// P7-tillägg: "Förluster drar manpower och publicSupport" (spec 5, "Faktion") körs
// också här, inte i factions.ts — samma skäl som attribution i deliveries.ts: datan
// (denna turs förluster per sida) finns bara i det ögonblick den beräknas.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Faction, FactionId, Front } from '../../types.js'

interface Balance {
  frontEquipmentWeight: number
  frontManpowerWeight: number
  frontBreakthroughThreshold: number
  frontBreakthroughMagnitude: number
  frontBaseAttritionPct: number
  frontMoraleShiftPerTurn: number
  publicSupportLossPerCasualty: number
}
const BALANCE = balanceData as unknown as Balance

function otherSide(side: 'a' | 'b'): 'a' | 'b' {
  return side === 'a' ? 'b' : 'a'
}

// Given-formeln (spec 5): equipmentRatio = attackerArtillery / max(1, defenderArtillery).
// Generaliserad till "fördel" (ratio − 1, > 0 gynnar den första sidan) så samma
// funktion kan användas för både materiel och manskap.
function ratioAdvantage(first: number, second: number): number {
  return first / Math.max(1, second) - 1
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function applyCasualtiesToFaction(faction: Faction | undefined, casualties: number): void {
  if (!faction || casualties <= 0) return
  faction.manpower = Math.max(0, faction.manpower - casualties)
  faction.publicSupport = clamp(faction.publicSupport - casualties * BALANCE.publicSupportLossPerCasualty, 0, 100)
}

export const fronts: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const front of Object.values(draft.fronts)) {
    const attacker = front.attacker
    const defender = otherSide(attacker)

    const attackerArtillery = front.equipment[attacker].artillery
    const defenderArtillery = front.equipment[defender].artillery

    if (attackerArtillery === 0 && defenderArtillery === 0) {
      // Ingen materiel levererad till någon sida än. Fronten stagnerar helt.
      continue
    }

    resolveFront(front, attacker, defender, draft.factions, emit)
  }
}

function resolveFront(
  front: Front,
  attacker: 'a' | 'b',
  defender: 'a' | 'b',
  factions: Record<FactionId, Faction>,
  emit: ResolveContext['emit'],
): void {
  const equipmentAdvantage = ratioAdvantage(front.equipment[attacker].artillery, front.equipment[defender].artillery)
  const manpowerAdvantage = ratioAdvantage(front.strength[attacker], front.strength[defender])
  // terrainBonus gynnar FÖRSVARAREN (spec 2.3), alltså subtraheras den från
  // anfallarens fördel. supplyStress hos försvararen, om högre än anfallarens,
  // gynnar anfallaren.
  const terrainAdjustment = -front.terrainBonus / 100
  const supplyAdjustment = (front.supplyStress[defender] - front.supplyStress[attacker]) / 100

  const netAdvantage =
    equipmentAdvantage * BALANCE.frontEquipmentWeight +
    manpowerAdvantage * BALANCE.frontManpowerWeight +
    terrainAdjustment +
    supplyAdjustment

  // Förluster: den missgynnade sidan tar fler. Klampad så ingen sida någonsin blir
  // helt förskonad eller utplånad på en enda tur.
  const clampedAdvantage = clamp(netAdvantage, -1, 1)
  const attackerLossPct = clamp(BALANCE.frontBaseAttritionPct * (1 - clampedAdvantage), 0.2, BALANCE.frontBaseAttritionPct * 2)
  const defenderLossPct = clamp(BALANCE.frontBaseAttritionPct * (1 + clampedAdvantage), 0.2, BALANCE.frontBaseAttritionPct * 2)

  const attackerCasualties = Math.round(front.strength[attacker] * (attackerLossPct / 100))
  const defenderCasualties = Math.round(front.strength[defender] * (defenderLossPct / 100))

  front.strength[attacker] = Math.max(0, front.strength[attacker] - attackerCasualties)
  front.strength[defender] = Math.max(0, front.strength[defender] - defenderCasualties)
  front.casualtiesTotal[attacker] += attackerCasualties
  front.casualtiesTotal[defender] += defenderCasualties

  // "Förluster drar manpower och publicSupport" (spec 5, "Faktion") — den datan finns
  // bara här, i samma ögonblick förlusterna faktiskt beräknas, så den appliceras
  // direkt på respektive sidas faktion. Se ANDRINGSLOGG.md.
  applyCasualtiesToFaction(factions[front.sideA], attacker === 'a' ? attackerCasualties : defenderCasualties)
  applyCasualtiesToFaction(factions[front.sideB], attacker === 'b' ? attackerCasualties : defenderCasualties)

  const moraleShift = BALANCE.frontMoraleShiftPerTurn * clampedAdvantage
  front.morale[attacker] = clamp(front.morale[attacker] + moraleShift, 0, 100)
  front.morale[defender] = clamp(front.morale[defender] - moraleShift, 0, 100)

  emit({
    severity: 'ticker',
    scope: 'front',
    headline: `${front.id.toUpperCase()}: ${attackerCasualties + defenderCasualties} CASUALTIES THIS QUARTER`,
    causeId: null,
    delta: { [`casualtiesTotal.${attacker}`]: attackerCasualties, [`casualtiesTotal.${defender}`]: defenderCasualties },
    actorIsPlayer: false,
    subjectId: front.id,
  })

  // Position flyttas vid genombrott (spec 5) — bara när obalansen passerar
  // tröskeln, inte varje tur.
  if (Math.abs(netAdvantage) > BALANCE.frontBreakthroughThreshold) {
    const winner = netAdvantage > 0 ? attacker : defender
    const positionDelta = winner === 'a' ? -BALANCE.frontBreakthroughMagnitude : BALANCE.frontBreakthroughMagnitude
    front.position = clamp(front.position + positionDelta, -100, 100)

    emit({
      severity: 'headline',
      scope: 'front',
      headline: `BREAKTHROUGH ON THE ${front.id.toUpperCase()} FRONT — POSITION SHIFTS TOWARD SIDE ${winner.toUpperCase()}`,
      causeId: null,
      delta: { position: positionDelta },
      actorIsPlayer: false,
      subjectId: front.id,
    })
  }
}
