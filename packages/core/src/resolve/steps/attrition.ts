// attrition — materielförslitning. Se ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 3 ("Materielförslitning").
//
// Ett EGET pipeline-steg, insatt direkt efter `fronts` (P33:s egen instruktion) —
// INTE inline i fronts.ts:s resolveFront, trots att avsnitt 3.1:s formulering
// ("i fronts.ts, efter... före...") beskriver VAR i beräkningen regeln hör hemma,
// inte VILKEN fil den ska stå i. Formeln behöver clampedAdvantage och causeId:t
// till turens förlust-ticker, båda bara lokala i fronts.ts:s resolveFront —
// flyttade hit via två nya, transienta Front-fält (lastClampedAdvantage/
// lastCasualtyEventId, se types.ts), samma mönster som P6:s
// Theatre.deliveriesIntoActiveWarThisTurn: enda sättet att flytta ett värde
// mellan två separata pipelinepassager utan att bryta ResolveContext:s frysta
// form.
//
// Upprepar AVSIKTLIGT fronts.ts:s stagnationskontroll (båda sidors artilleri 0)
// för att avgöra om fronten hade strid den här turen — annars läser den här
// filen ett kvarblivet, ogiltigt lastClampedAdvantage-värde från en tidigare
// tur. Det är också exakt "en front utan strid" betyder i den här motorn idag
// (P33:s eget klart när, se avsnitt 0/fynd 3: bara artilleri avgör stagnation).
import balanceData from '../../data/balance.json' with { type: 'json' }
import { allocateByWeight } from '../allocateByWeight.js'
import type { ResolveStep } from '../index.js'
import { otherSide } from './fronts.js'
import type { Front, TechCategory } from '../../types.js'

interface Balance {
  frontBaseAttritionPct: number
  equipmentAttritionCoupling: number
  attritionLoserMultiplier: number
  categoryVulnerability: Record<TechCategory, number>
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

// P39 (ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md avsnitt 5.1): P38:s invariant
// (Σ formations[side].equipment[c] === front.equipment[side][c]) gäller nu ÄVEN
// här — den här filen fanns före förbanden (P33) och minskade bara aggregatet
// direkt. Utan en motsvarande minskning över formationerna hade varje stridstur
// tyst brutit invarianten så fort attrition faktiskt förstörde något. Vikten är
// formationens NUVARANDE innehav (allmänt slitage bryr sig inte om doktrin) —
// till skillnad från deliveries.ts:s (P38) doktrinvikter vid TILLÄGG.
function reduceFormationsEquipment(front: Front, side: 'a' | 'b', category: TechCategory, units: number): void {
  if (units <= 0) return
  const candidates = front.formations.filter((f) => f.side === side && f.equipment[category] > 0)
  if (candidates.length === 0) return

  const allocated = allocateByWeight(
    candidates.map((f) => f.equipment[category]),
    units,
  )
  candidates.forEach((f, i) => {
    f.equipment[category] = Math.max(0, f.equipment[category] - allocated[i]!)
  })
}

export const attrition: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const front of Object.values(draft.fronts)) {
    // P59 (ETAPP5_TEKNISK_SPEC.md avsnitt 4.2): samma grind som fronts.ts —
    // "ceasefire ... alltså inget materielbehov". Kontrollerad FÖRE den
    // upprepade artilleri-stagnationskontrollen (filens egen huvudkommentar
    // förklarar varför den upprepas), inte i stället för den.
    if (front.status !== 'war') continue

    const attacker = front.attacker
    const defender = otherSide(attacker)

    const attackerArtillery = front.equipment[attacker].artillery
    const defenderArtillery = front.equipment[defender].artillery
    if (attackerArtillery === 0 && defenderArtillery === 0) continue // ingen strid denna tur

    const clampedAdvantage = front.lastClampedAdvantage
    // Samma "missgynnad sida" som fronts.ts:s egen förlustfördelning (avsnitt
    // 3.1: attritionPct(side) = ... × (side === loser ? attritionLoserMultiplier
    // : 1)) — den sida clampedAdvantage INTE gynnar tar den skärpta kvoten.
    const loser: 'a' | 'b' = clampedAdvantage > 0 ? defender : attacker
    const intensity = BALANCE.frontBaseAttritionPct * (1 + Math.abs(clampedAdvantage))

    for (const side of ['a', 'b'] as const) {
      const attritionPct = intensity * BALANCE.equipmentAttritionCoupling * (side === loser ? BALANCE.attritionLoserMultiplier : 1)
      const factionId = side === 'a' ? front.sideA : front.sideB
      const faction = draft.factions[factionId]

      const destroyedByCategory: Partial<Record<TechCategory, number>> = {}
      let totalDestroyed = 0
      for (const category of TECH_CATEGORIES) {
        const before = front.equipment[side][category]
        if (before <= 0) continue
        const destroyed = Math.floor((before * attritionPct) / 100 * BALANCE.categoryVulnerability[category])
        if (destroyed <= 0) continue
        front.equipment[side][category] = Math.max(0, before - destroyed)
        reduceFormationsEquipment(front, side, category, destroyed)
        destroyedByCategory[category] = destroyed
        totalDestroyed += destroyed
        // P34 (avsnitt 4.1): "fronts.ts (efter förslitning) need[cat] +=
        // destroyed(denna faktions sida, cat)" — den kod som faktiskt
        // beräknar `destroyed` är attrition.ts (P33 bröt ut den till ett eget
        // steg, se filens huvudkommentar), så det är här ackumuleringen hör
        // hemma, inte i fronts.ts. Ordagrant på formelnivå — bara filnamnet i
        // specens prosa är efter P33 inaktuellt, inte den avsedda platsen i
        // pipelinen (P34:s eget avsnitt 9-prompt säger redan "attrition.ts").
        if (faction) faction.materielNeed[category] += destroyed
      }
      if (totalDestroyed === 0) continue // inget faktiskt förlorat — inget att emitta (CLAUDE.md hård regel 4 gäller bara verkliga ändringar)

      const factionName = faction ? faction.name.toUpperCase() : factionId.toUpperCase()
      const lossText = TECH_CATEGORIES.filter((c) => destroyedByCategory[c] !== undefined)
        .map((c) => `${destroyedByCategory[c]} ${c.toUpperCase()}`)
        .join(', ')

      const delta: Record<string, number> = {}
      for (const category of TECH_CATEGORIES) {
        const destroyed = destroyedByCategory[category]
        if (destroyed !== undefined) delta[`equipment.${category}`] = -destroyed
      }

      emit({
        severity: 'ticker',
        scope: 'front',
        headline: `${factionName} LOSES ${lossText} TO ATTRITION ON THE ${front.id.toUpperCase()} FRONT`,
        causeId: front.lastCasualtyEventId,
        delta,
        actorIsPlayer: false,
        subjectId: front.id,
      })
    }
  }
}
