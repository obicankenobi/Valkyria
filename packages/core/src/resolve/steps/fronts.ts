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
import { engagement } from '../engagement.js'
import { allocateByWeight } from '../allocateByWeight.js'
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

// Exporterad — resolve/steps/attrition.ts (P33) behöver samma sidbytesfunktion.
export function otherSide(side: 'a' | 'b'): 'a' | 'b' {
  return side === 'a' ? 'b' : 'a'
}

// Given-formeln (spec 5): equipmentRatio = attackerArtillery / max(1, defenderArtillery).
// Generaliserad till "fördel" (ratio − 1, > 0 gynnar den första sidan) så samma
// funktion kan användas för både materiel och manskap. Exporterad sedan P39 —
// resolve/engagement.ts (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.3)
// kräver uttryckligen "SAMMA matematik som fronts.ts redan använder", samma
// återanvändningsmönster som otherSide (P33).
export function ratioAdvantage(first: number, second: number): number {
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

// P42 (upptäckt under härnessmätningen, ägaren tillfrågad — se ANDRINGSLOGG.md):
// resolveFront minskar front.strength[sida] direkt via sin egen, redan sedan P6
// existerande förlustformel, utan att röra formationerna — bröt invarianten i
// avsnitt 5.1 så fort P38/P39:s förband fanns (Σ formations[sida].strength drev
// isär från front.strength, mätt: alltid strength, aldrig equipment). Samma
// mönster som attrition.ts:s (P39) motsvarande fix för equipment — vikten är
// formationernas NUVARANDE styrka (aggregatets kollektiva förlustformel bryr
// sig inte om vilket enskilt förband som råkar tappa mest).
function reduceFormationsStrength(front: Front, side: 'a' | 'b', casualties: number): void {
  if (casualties <= 0) return
  const candidates = front.formations.filter((f) => f.side === side && f.strength > 0)
  if (candidates.length === 0) return

  const allocated = allocateByWeight(
    candidates.map((f) => f.strength),
    casualties,
  )
  candidates.forEach((f, i) => {
    f.strength = Math.max(0, f.strength - allocated[i]!)
  })
}

// P36 (avsnitt 4.3): pressure härleds ur "position-förändring senaste 3
// turerna" — fyra punkter (nu + tre bakåt) räcker för den jämförelsen, se
// orders.ts:s computePressureForBuyer. Ingen balanssiffra — ett rent
// datastrukturfönster, samma sorts kodkonstant som wire.ts:s WIRE_WINDOW_TURNS.
const FRONT_TRACE_LENGTH = 4

export const fronts: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const front of Object.values(draft.fronts)) {
    // Skrivs VARJE tur, även en stagnerad front (position då oförändrad) —
    // annars får trace hål som gör "tre turer bakåt" tvetydigt.
    front.trace.push(front.position)
    if (front.trace.length > FRONT_TRACE_LENGTH) front.trace.shift()

    const attacker = front.attacker
    const defender = otherSide(attacker)

    const attackerArtillery = front.equipment[attacker].artillery
    const defenderArtillery = front.equipment[defender].artillery

    if (attackerArtillery === 0 && defenderArtillery === 0) {
      // Ingen materiel levererad till någon sida än. Fronten stagnerar helt.
      continue
    }

    // P39 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.3/9): förbandens
    // egen strid löses FÖRE aggregatberäkningen (P39:s egen instruktion,
    // ordagrant) — engagement() skriver om front.equipment/front.strength ur
    // formationerna (steg 5, invarianten i 5.1), och resolveFront nedan räknar
    // sedan vidare på de UPPDATERADE aggregaten, samma tur.
    engagement(draft, front, attacker, defender, emit)

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
  reduceFormationsStrength(front, attacker, attackerCasualties)
  front.strength[defender] = Math.max(0, front.strength[defender] - defenderCasualties)
  reduceFormationsStrength(front, defender, defenderCasualties)
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

  // P33 (avsnitt 3.1/3.3): resolve/steps/attrition.ts körs direkt efter det här
  // steget och behöver både clampedAdvantage och den här tickerns id (causeId till
  // förslitningens egen ticker, kedjans första led). Skrivs bara här, i samma
  // ögonblick värdena faktiskt finns — se types.ts:s kommentar på fälten.
  front.lastClampedAdvantage = clampedAdvantage
  front.lastCasualtyEventId = emit({
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
