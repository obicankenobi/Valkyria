// licence.ts — P135 (ETAPP9_FORSLAG.md §8b.4, reducerad). Licenser och embargo som skapar en konkurrent.
//
// En LICENS ger ett engångsbelopp och en royalty varje tur. Samtidigt växer licenstagarens förmåga (`Licence.capability`), och när den
// nått `licenceRivalCapability` upphör licensen — licenstagaren tillverkar själv och blir en NY RIVAL på husets marknader. En EMBARGERAD
// faktion (`Faction.embargoed`, den befintliga EMBARGO-mekaniken, P57) växer `licenceEmbargoGrowthFactor` gånger så fort: ett embargo som
// skär av leveranserna tvingar fram en egen tillverkning (förebild: Israels Nesher efter Frankrikes embargo 1969).
//
// Licenser är en stående order (`LICENCE GRANT`/`REVOKE`, ingen handling). Exklusiviteten och exportlistan (P132) gäller också licenser:
// en konstruktion bunden till ett block kan inte licensieras till det andra, och en exportreglerad licens över blockgränsen bryter mot
// exportreglerna (doomsday, heat, ett pappersspår).
//
// EJ BYGGT (reduceringen): kundanpassningar som driver upp kostnaden och kan utlösa en politisk skandal hos köparen (halverad order).
import balanceData from './data/balance.json' with { type: 'json' }
import { applyExportViolation, exclusivityRejection, isExportViolation } from './exportRules.js'
import { recordIncome } from './ledger.js'
import { blocOfFaction } from './race.js'
import type { ResolveContext } from './resolve/index.js'
import type { ActionValidation, FactionId, GameState, Licence, RivalHouse, StandingOrderChange } from './types.js'

const BALANCE = balanceData as unknown as {
  licenceLumpSum: number
  licenceRoyaltyPerTurn: number
  licenceCapabilityPerTurn: number
  licenceRivalCapability: number
  licenceEmbargoGrowthFactor: number
  licenceRivalCapital: number
  licenceRivalMarketShare: number
}

// Vad en licens ger — för visning (förhandsvisningen läser samma tal som ordern tillämpar).
export const LICENCE_TERMS = { lumpSum: BALANCE.licenceLumpSum, royaltyPerTurn: BALANCE.licenceRoyaltyPerTurn, embargoGrowthFactor: BALANCE.licenceEmbargoGrowthFactor }

export const licenceRivalId = (factionId: FactionId): string => `licensee-${factionId}`

export function validateLicenceChange(draft: Readonly<GameState>, change: Extract<StandingOrderChange, { kind: 'LICENCE' }>): ActionValidation {
  const licences = draft.house.licences ?? []
  if (change.op === 'REVOKE') {
    return licences.some((l) => l.id === change.licenceId && l.status === 'active') ? { ok: true } : { ok: false, reason: 'no such active licence' }
  }
  const design = draft.house.designs.find((d) => d.id === change.designId)
  if (!design) return { ok: false, reason: 'unknown design' }
  if (design.status !== 'active') return { ok: false, reason: 'design is withdrawn' }
  const faction = draft.factions[change.factionId]
  if (!faction) return { ok: false, reason: 'unknown licensee' }
  if (faction.bankrupt) return { ok: false, reason: 'the licensee is bankrupt' }
  if (draft.rivals[licenceRivalId(change.factionId)]) return { ok: false, reason: 'the licensee already builds on its own' }
  if (licences.some((l) => l.designId === change.designId && l.factionId === change.factionId && l.status === 'active')) {
    return { ok: false, reason: 'that licence already exists' }
  }
  const exclusive = exclusivityRejection(draft, design, change.factionId)
  if (exclusive) return { ok: false, reason: exclusive }
  return { ok: true }
}

export function applyLicenceChange(ctx: ResolveContext, change: Extract<StandingOrderChange, { kind: 'LICENCE' }>): void {
  const { draft, emit } = ctx
  const licences = (draft.house.licences ??= [])
  if (change.op === 'REVOKE') {
    const licence = licences.find((l) => l.id === change.licenceId)!
    licence.status = 'ended'
    const faction = draft.factions[licence.factionId]
    emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${draft.house.name.toUpperCase()} REVOKES THE LICENCE OF ${faction ? faction.name.toUpperCase() : licence.factionId.toUpperCase()}`,
      causeId: null,
      delta: {},
      actorIsPlayer: true,
      subjectId: licence.factionId,
    })
    return
  }
  const design = draft.house.designs.find((d) => d.id === change.designId)!
  const faction = draft.factions[change.factionId]!
  const licence: Licence = {
    id: `licence-${licences.length + 1}`,
    designId: change.designId,
    factionId: change.factionId,
    sinceTurn: draft.meta.turn + 1,
    capability: 0,
    status: 'active',
  }
  licences.push(licence)
  draft.house.treasury += BALANCE.licenceLumpSum
  draft.house.revenueByTurn[draft.meta.turn] = (draft.house.revenueByTurn[draft.meta.turn] ?? 0) + BALANCE.licenceLumpSum
  recordIncome(draft, 'licence', BALANCE.licenceLumpSum)
  const id = emit({
    severity: 'headline',
    scope: 'house',
    headline: `${draft.house.name.toUpperCase()} LICENCES THE ${design.name.toUpperCase()} TO ${faction.name.toUpperCase()} (+£${BALANCE.licenceLumpSum.toLocaleString('en-GB')}, ROYALTIES FROM NEXT QUARTER)`,
    causeId: null,
    delta: { treasury: BALANCE.licenceLumpSum },
    actorIsPlayer: true,
    subjectId: change.factionId,
  })
  if (isExportViolation(draft, design, change.factionId)) applyExportViolation(ctx, design, change.factionId, licence.id, id)
}

// Skapar licenstagaren som en ny rival (en gång per faktion). Allt utom kapital och marknadsandel följer av konstruktionen och
// faktionen; temperamentet är 'patriot' (en stat som tillverkar åt sig själv).
function spawnLicenseeRival(draft: GameState, factionId: FactionId, category: RivalHouse['specialisation']): RivalHouse {
  const faction = draft.factions[factionId]!
  const bloc = blocOfFaction(draft, factionId)
  const relations: Record<FactionId, number> = {}
  for (const id of Object.keys(draft.factions)) relations[id] = id === factionId ? 70 : 20
  const rival: RivalHouse = {
    id: licenceRivalId(factionId),
    name: `${faction.name} Arsenal`,
    specialisation: category,
    aggression: 50,
    temperament: 'patriot',
    capital: BALANCE.licenceRivalCapital,
    marketShare: BALANCE.licenceRivalMarketShare,
    sabotagedUntilTurn: null,
    homeState: bloc ?? 'neutral',
    relations,
    reputation: { quality: 50, reliability: 50 },
    contracts: [],
    supplyPlayCooldownUntilTurn: null,
  }
  draft.rivals[rival.id] = rival
  return rival
}

// Varje tur: royalty, växande förmåga och — när förmågan räcker — en ny rival.
export function advanceLicences(ctx: ResolveContext): void {
  const { draft, emit } = ctx
  const licences = draft.house.licences
  if (!licences) return
  const turn = draft.meta.turn
  for (const licence of licences) {
    if (licence.status !== 'active' || licence.sinceTurn > turn) continue
    const faction = draft.factions[licence.factionId]
    const design = draft.house.designs.find((d) => d.id === licence.designId)
    if (!faction || !design) continue
    const royalty = BALANCE.licenceRoyaltyPerTurn
    draft.house.treasury += royalty
    draft.house.revenueByTurn[turn] = (draft.house.revenueByTurn[turn] ?? 0) + royalty
    recordIncome(draft, 'licence', royalty)
    const royaltyId = emit({
      severity: 'ticker',
      scope: 'house',
      headline: `${faction.name.toUpperCase()} PAYS £${royalty.toLocaleString('en-GB')} IN ROYALTIES ON THE ${design.name.toUpperCase()}`,
      causeId: null,
      delta: { treasury: royalty },
      actorIsPlayer: true,
      subjectId: licence.factionId,
    })
    licence.capability = Math.min(100, licence.capability + BALANCE.licenceCapabilityPerTurn * (faction.embargoed ? BALANCE.licenceEmbargoGrowthFactor : 1))
    if (licence.capability < BALANCE.licenceRivalCapability) continue
    licence.status = 'ended'
    if (draft.rivals[licenceRivalId(licence.factionId)]) continue
    const rival = spawnLicenseeRival(draft, licence.factionId, design.category)
    emit({
      severity: 'headline',
      scope: 'market',
      headline: faction.embargoed
        ? `EMBARGOED ${faction.name.toUpperCase()} STARTS ITS OWN ARMS WORKS FROM THE ${design.name.toUpperCase()} — ${rival.name.toUpperCase()} IS A NEW RIVAL`
        : `${faction.name.toUpperCase()} NOW BUILDS THE ${design.name.toUpperCase()} ITSELF — ${rival.name.toUpperCase()} ENTERS THE MARKET`,
      causeId: royaltyId,
      delta: { [`rivals.${rival.id}`]: 1 },
      actorIsPlayer: false,
      subjectId: licence.factionId,
    })
  }
}
