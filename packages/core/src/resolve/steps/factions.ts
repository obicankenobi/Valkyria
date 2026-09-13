// factions — faktionsekonomi, publicSupport, bankrutt. Se ETAPP1_TEKNISK_SPEC.md
// avsnitt 5 ("Faktion").
//
// "Förluster drar manpower och publicSupport" körs i fronts.ts (P6), inte här — se
// den filens huvudkommentar (samma skäl som attribution: datan finns bara där
// förlusterna beräknas). Det den här filen faktiskt gör: embargots ekonomiska
// effekt (PROVISORISK, se nedan), bankruttdetektion + kontraktsannullering med
// causeId-kedja, och lowSupport-detektion (notifiering — ingen ytterligare mekanisk
// konsekvens av "forced peace" är specificerad någonstans, se ANDRINGSLOGG.md).
//
// Embargo har ingen egen mekanik i avsnitt 5:s Faktion-stycke — bara fältet
// Faction.embargoed finns (avsnitt 2.5), och ingen PlayerAction kan sätta det
// (samma applyActions-lucka ANDRINGSLOGG.md loggat sedan P2). P7:s klart när-
// villkor kräver ändå en "embargokedja hela vägen till en annullerad order" —
// löst genom att embargo får en egen, PROVISORISK ekonomisk konsekvens (en
// kvartalsvis kassadränering) som ett test kan trigga genom att direkt sätta
// embargoed: true på en handbyggd faktion (spec 7.1). Se ANDRINGSLOGG.md.
import balanceData from '../../data/balance.json' with { type: 'json' }
import type { ResolveContext, ResolveStep } from '../index.js'
import type { Faction, GameState } from '../../types.js'

interface Balance {
  factionBankruptcyTurns: number
  factionLowSupportTurns: number
  factionLowSupportThreshold: number
  embargoTreasuryDrainPerTurn: number
}
const BALANCE = balanceData as unknown as Balance

export const factions: ResolveStep = (ctx) => {
  const { draft, emit } = ctx

  for (const faction of Object.values(draft.factions)) {
    if (faction.bankrupt) continue // redan avgjort för den här faktionen

    processEconomicDistress(faction, draft, emit)
    processLowSupport(faction, emit)
  }
}

function processEconomicDistress(faction: Faction, draft: GameState, emit: ResolveContext['emit']): void {
  // Kedjans första led: embargots ekonomiska smäll DENNA tur, om någon. Ingen
  // sparad över-turer-referens behövs — bankrutt kan bara triggas av den SENASTE
  // av de factionBankruptcyTurns i rad, så om embargo var orsaken är det alltid
  // den här turens dräneringshändelse som är den riktiga, omedelbara orsaken.
  let drainEventId: string | null = null

  if (faction.embargoed) {
    faction.treasury -= BALANCE.embargoTreasuryDrainPerTurn
    drainEventId = emit({
      severity: 'report',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()}'S ECONOMY STRAINS UNDER YOUR EMBARGO (-£${BALANCE.embargoTreasuryDrainPerTurn.toLocaleString('en-GB')})`,
      causeId: null,
      delta: { treasury: -BALANCE.embargoTreasuryDrainPerTurn },
      actorIsPlayer: true,
      subjectId: faction.id,
    })
  }

  faction.negativeTreasuryTurns = faction.treasury < 0 ? faction.negativeTreasuryTurns + 1 : 0
  if (faction.negativeTreasuryTurns < BALANCE.factionBankruptcyTurns) return

  faction.bankrupt = true
  const bankruptcyId = emit({
    severity: 'headline',
    scope: 'faction',
    headline: `${faction.name.toUpperCase()} BANKRUPT — ALL CONTRACTS VOIDED`,
    // Ärligt: bara satt när embargo faktiskt var den här turens orsak. Annars null
    // (t.ex. om en faktion går bankrutt av andra skäl — inget att peka tillbaka på).
    causeId: drainEventId,
    delta: {},
    actorIsPlayer: drainEventId !== null,
    subjectId: faction.id,
  })

  for (const contract of draft.market.contracts) {
    if (contract.buyerId !== faction.id) continue
    if (contract.status === 'voided' || contract.status === 'fulfilled') continue

    contract.status = 'voided'
    emit({
      severity: 'report',
      scope: 'market',
      headline: `CONTRACT ${contract.id} VOIDED — ${faction.name.toUpperCase()} BANKRUPT`,
      causeId: bankruptcyId,
      delta: {},
      actorIsPlayer: false,
      subjectId: faction.id,
    })
  }
}

function processLowSupport(faction: Faction, emit: ResolveContext['emit']): void {
  faction.lowSupportTurns = faction.publicSupport < BALANCE.factionLowSupportThreshold ? faction.lowSupportTurns + 1 : 0

  // === (inte >=): en engångshändelse på korsningsturen, inte en repeterande
  // notis varje tur stödet förblir lågt.
  if (faction.lowSupportTurns === BALANCE.factionLowSupportTurns) {
    emit({
      severity: 'headline',
      scope: 'faction',
      headline: `${faction.name.toUpperCase()} FORCED TO SUE FOR PEACE — PUBLIC SUPPORT COLLAPSED`,
      causeId: null,
      delta: {},
      actorIsPlayer: false,
      subjectId: faction.id,
    })
  }
}
