// attrition — materielförslitning. Se ETAPP3_KRIGET_SOM_MARKNAD_TEKNISK_SPEC.md
// avsnitt 3 ("Materielförslitning").
//
// Ett EGET pipeline-steg, insatt direkt efter `fronts` (P43:s egen instruktion) —
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
// (P43:s eget klart när, se avsnitt 0/fynd 3: bara artilleri avgör stagnation).
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveStep } from '../index.js'
import { otherSide } from './fronts.js'
import type { TechCategory } from '../../types.js'

interface Balance {
  frontBaseAttritionPct: number
  equipmentAttritionCoupling: number
  attritionLoserMultiplier: number
  categoryVulnerability: Record<TechCategory, number>
}
const BALANCE = balanceData as unknown as Balance

const TECH_CATEGORIES: readonly TechCategory[] = ['infantry', 'artillery', 'armour', 'aviation', 'naval', 'electronics']

export const attrition: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const front of Object.values(draft.fronts)) {
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

      const destroyedByCategory: Partial<Record<TechCategory, number>> = {}
      let totalDestroyed = 0
      for (const category of TECH_CATEGORIES) {
        const before = front.equipment[side][category]
        if (before <= 0) continue
        const destroyed = Math.floor((before * attritionPct) / 100 * BALANCE.categoryVulnerability[category])
        if (destroyed <= 0) continue
        front.equipment[side][category] = Math.max(0, before - destroyed)
        destroyedByCategory[category] = destroyed
        totalDestroyed += destroyed
      }
      if (totalDestroyed === 0) continue // inget faktiskt förlorat — inget att emitta (CLAUDE.md hård regel 4 gäller bara verkliga ändringar)

      const factionId = side === 'a' ? front.sideA : front.sideB
      const faction = draft.factions[factionId]
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
