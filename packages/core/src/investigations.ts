// investigations — P113 (ETAPP9_FORSLAG.md §5.6). Olycksfåglar och utredningar: rapporter från fältet om en konstruktion
// med en dold miljöbrist, utredningskortets tre val (åtgärda i fält / förneka / konstruera om) och det förnekande som kan
// komma fram. Inget nytt pipeline-steg: olycksfallet dras i deliveries.ts (där leveransen sker), valen tas emot som en
// stående order (standingOrders.ts, ingen handling) och standardförnekandet avgörs i applyActions.ts.
//
// All slump via ctx.rng (hård regel 2), bara när ett villkor faktiskt är uppfyllt — ett parti utan en felaktig
// konstruktion drar aldrig härifrån. Varje ändring emitterar en WireEvent med causeId (hård regel 4).
import balanceData from './data/balance.json' with { type: 'json' }
import { buyerIsLosing } from './fieldQuality.js'
import { currentGeneration, frontEnvironments, newDesignProject, revealFlaw } from './design.js'
import { recordExpense } from './ledger.js'
import { officialId } from './officials.js'
import type { ResolveContext } from './resolve/index.js'
import type { Contract, Design, GameState, House, Investigation, InvestigationChoice } from './types.js'

interface Balance {
  casualtyChancePctPerSeverity: number
  investigationDeadlineTurns: number
  casualtyFixCost: number
  casualtyFixFailPct: number
  casualtyFixFailQualityPenalty: number
  denyStandingPenalty: number
  denyQualityPenaltyPerDelivery: number
  denyExposureChancePct: number
  denyExposedStandingPenalty: number
  qualityScandalPenalty: number
  qualityScandalTurns: number
  qualityCategoryCap: number
  retoolingTurns: number
  blameRelationPenalty: number
  blameProvenLoss: number
}
const BALANCE = balanceData as unknown as Balance

export const INVESTIGATION_CHOICES: readonly InvestigationChoice[] = ['FIX', 'DENY', 'REDESIGN']

function investigationsOf(house: House): Investigation[] {
  return (house.investigations ??= [])
}

function isClosed(inv: Investigation): boolean {
  return inv.status === 'fixed' || inv.status === 'exposed' || inv.status === 'redesigning'
}

function addCategoryQuality(house: House, category: Design['category'], delta: number): number {
  const record = (house.categoryQuality ??= { infantry: 0, artillery: 0, armour: 0, aviation: 0, naval: 0, electronics: 0 })
  const before = record[category] ?? 0
  const after = Math.max(-BALANCE.qualityCategoryCap, Math.min(BALANCE.qualityCategoryCap, before + delta))
  record[category] = after
  return after - before
}

function lowerStanding(state: GameState, buyerId: string, amount: number): void {
  const official = state.officials[officialId(buyerId, 'procurement')]
  if (official) official.standing = Math.max(0, official.standing - amount)
}

export function validateInvestigationChoice(
  house: House,
  change: { investigationId: string; choice: InvestigationChoice },
): string | null {
  const inv = house.investigations?.find((i) => i.id === change.investigationId)
  if (!inv) return 'unknown investigation'
  if (!(INVESTIGATION_CHOICES as readonly string[]).includes(change.choice)) return 'unknown investigation choice'
  if (isClosed(inv)) return 'the investigation is already closed'
  if (change.choice === 'DENY' && inv.status === 'denied') return 'the investigation is already denied'
  if (change.choice === 'FIX' && house.treasury < BALANCE.casualtyFixCost) return 'not enough cash to fix the fault in the field'
  if (change.choice === 'REDESIGN') {
    const design = house.designs.find((d) => d.id === inv.designId)
    if (design && house.rnd.some((p) => p.category === design.category && p.design)) return 'a design project is already running in that category'
  }
  return null
}

// Förnekandet (valt eller standard): ingen kostnad nu, tjänstemannen tappar anseende, konstruktionen märks som förnekad.
function denyInvestigation(ctx: ResolveContext, inv: Investigation, headline: string): void {
  const { draft, emit } = ctx
  inv.status = 'denied'
  const design = draft.house.designs.find((d) => d.id === inv.designId)
  if (design) design.denied = true
  lowerStanding(draft, inv.buyerId, BALANCE.denyStandingPenalty)
  emit({
    severity: 'report',
    scope: 'house',
    headline,
    causeId: inv.causeEventId,
    delta: {},
    actorIsPlayer: true,
    subjectId: inv.buyerId,
  })
}

export function applyInvestigationChoice(ctx: ResolveContext, change: { investigationId: string; choice: InvestigationChoice }): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  const inv = investigationsOf(house).find((i) => i.id === change.investigationId)!
  const design = house.designs.find((d) => d.id === inv.designId)
  const name = (design?.name ?? inv.designId).toUpperCase()

  switch (change.choice) {
    case 'DENY':
      denyInvestigation(ctx, inv, `${house.name.toUpperCase()} DENIES THE FAULT IN ${name} — THE INQUIRY INTO ${inv.frontId.toUpperCase()} GOES NOWHERE (FOR NOW)`)
      break

    case 'FIX': {
      const cost = BALANCE.casualtyFixCost
      house.treasury -= cost
      recordExpense(draft, 'lines', cost)
      inv.status = 'fixed'
      // Omställning: linjer som tillverkar för kontrakt med konstruktionen står stilla medan ändringen görs.
      for (const line of house.lines) {
        const contract = line.assignedContractId ? draft.market.contracts.find((c) => c.id === line.assignedContractId) : undefined
        if (contract?.designId === inv.designId) {
          line.status = 'retooling'
          line.retoolingUntilTurn = draft.meta.turn + BALANCE.retoolingTurns
        }
      }
      const fixId = emit({
        severity: 'report',
        scope: 'house',
        headline: `${house.name.toUpperCase()} FIXES THE ${inv.environment.toUpperCase()} FAULT IN ${name} IN THE FIELD (−£${cost.toLocaleString('en-GB')})`,
        causeId: inv.causeEventId,
        delta: { treasury: -cost },
        actorIsPlayer: true,
        subjectId: inv.buyerId,
      })
      if (design) {
        design.denied = false
        if (rng.chance(BALANCE.casualtyFixFailPct)) {
          const delta = addCategoryQuality(house, design.category, -BALANCE.casualtyFixFailQualityPenalty)
          emit({
            severity: 'report',
            scope: 'house',
            headline: `THE FIX ON ${name} DOES NOT HOLD — THE FAULT REMAINS`,
            causeId: fixId,
            delta: { [`categoryQuality.${design.category}`]: delta },
            actorIsPlayer: true,
            subjectId: inv.buyerId,
          })
        } else {
          design.latentFlaw = null
          design.flawRevealed = false
        }
      }
      break
    }

    case 'REDESIGN': {
      if (!design) break
      design.status = 'withdrawn'
      inv.status = 'redesigning'
      const project = newDesignProject(
        house,
        {
          category: design.category,
          focus: design.focus,
          ambition: 'timely',
          targetGeneration: Math.max(design.generation, currentGeneration(draft.meta.turn)),
          upgradeOf: design.id,
          redesignOf: design.id,
        },
        draft.meta.turn,
      )
      house.rnd.push(project)
      emit({
        severity: 'report',
        scope: 'house',
        headline: `${house.name.toUpperCase()} WITHDRAWS ${name} AND REDESIGNS IT (${project.turnsTotal} TURNS WITHOUT THE PRODUCT)`,
        causeId: inv.causeEventId,
        delta: {},
        actorIsPlayer: true,
        subjectId: inv.buyerId,
      })
      break
    }
  }
}

// Anropas från deliveries.ts för varje anländ skeppning som bär en konstruktion. En förnekad konstruktion kostar
// kategoriryktet per leverans; en med en avslöjad-eller-dold brist i frontens miljö kan ge en rapport från fältet.
export function onDesignDelivery(ctx: ResolveContext, contract: Contract, frontId: string, deliveryId: string): void {
  if (contract.designId === undefined) return
  const { draft, rng, emit } = ctx
  const house = draft.house
  const design = house.designs?.find((d) => d.id === contract.designId)
  if (!design) return

  if (design.denied) {
    const delta = addCategoryQuality(house, design.category, -BALANCE.denyQualityPenaltyPerDelivery)
    if (delta !== 0) {
      emit({
        severity: 'ticker',
        scope: 'house',
        headline: `${house.name.toUpperCase()}'S ${design.category.toUpperCase()} REPUTATION SLIPS — DENIED FAULT IN ${design.name.toUpperCase()}`,
        causeId: deliveryId,
        delta: { [`categoryQuality.${design.category}`]: delta },
        actorIsPlayer: true,
        subjectId: contract.buyerId,
      })
    }
    return
  }

  const flaw = design.latentFlaw
  if (!flaw || !frontEnvironments(frontId).includes(flaw.environment)) return
  if (investigationsOf(house).some((i) => i.designId === design.id && !isClosed(i))) return
  if (!rng.chance(BALANCE.casualtyChancePctPerSeverity * flaw.severity)) return

  revealFlaw(design)
  const reportId = emit({
    severity: 'headline',
    scope: 'front',
    headline: `FIELD REPORT: ${design.name.toUpperCase()} FAILS IN ${flaw.environment.toUpperCase()} CONDITIONS ON THE ${frontId.toUpperCase()} FRONT`,
    causeId: deliveryId,
    delta: {},
    actorIsPlayer: true,
    subjectId: frontId,
  })
  const inv: Investigation = {
    id: `inv-${design.id}-${draft.meta.turn}`,
    designId: design.id,
    environment: flaw.environment,
    severity: flaw.severity,
    frontId,
    buyerId: contract.buyerId,
    openedTurn: draft.meta.turn,
    deadlineTurn: draft.meta.turn + BALANCE.investigationDeadlineTurns,
    status: 'open',
    causeEventId: reportId,
  }
  investigationsOf(house).push(inv)

  // P114 (§6.2): en olycksfågel vid ett NEDERLAG ger den omvända rubriken — köparen skyller på leverantören, relationen
  // sjunker och konstruktionen tappar fälttillfällen och stridsbeprövad-stämpeln.
  const front = draft.fronts[frontId]
  const buyer = draft.factions[contract.buyerId]
  if (front && buyer && buyerIsLosing(front, contract.buyerId)) {
    buyer.relationToPlayer = Math.max(0, buyer.relationToPlayer - BALANCE.blameRelationPenalty)
    design.fieldRecord.occasions = Math.max(0, design.fieldRecord.occasions - BALANCE.blameProvenLoss)
    design.fieldRecord.proven = false
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `${buyer.name.toUpperCase()} BLAMES ${house.name.toUpperCase()} FOR THE DEFEAT ON THE ${frontId.toUpperCase()} FRONT — ${design.name.toUpperCase()} FAILED`,
      causeId: reportId,
      delta: { relationToPlayer: -BALANCE.blameRelationPenalty },
      actorIsPlayer: true,
      subjectId: contract.buyerId,
    })
  }

  emit({
    severity: 'report',
    scope: 'house',
    headline: `INQUIRY OPENED INTO ${design.name.toUpperCase()} — ${house.name.toUpperCase()} MUST ANSWER WITHIN ${BALANCE.investigationDeadlineTurns} TURNS`,
    causeId: reportId,
    delta: {},
    actorIsPlayer: true,
    subjectId: contract.buyerId,
  })
}

// Varje tur kan sanningen om ett förnekande komma fram: en kvalitetsskandal (samma fönster som klass C-skandalen i
// deliveries.ts; en redan pågående skandal förlängs bara) och ytterligare tappat anseende hos tjänstemannen.
export function exposeDenials(ctx: ResolveContext): void {
  const { draft, rng, emit } = ctx
  const house = draft.house
  for (const design of house.designs ?? []) {
    if (!design.denied) continue
    if (!rng.chance(BALANCE.denyExposureChancePct)) continue
    const inv = investigationsOf(house).find((i) => i.designId === design.id && i.status === 'denied')
    design.denied = false
    if (inv) inv.status = 'exposed'
    if (house.scandalUntilTurn === null) {
      house.reputation.quality = Math.max(0, house.reputation.quality - BALANCE.qualityScandalPenalty)
    }
    house.scandalUntilTurn = draft.meta.turn + BALANCE.qualityScandalTurns
    if (inv) lowerStanding(draft, inv.buyerId, BALANCE.denyExposedStandingPenalty)
    emit({
      severity: 'headline',
      scope: 'house',
      headline: `COVER-UP EXPOSED: ${design.name.toUpperCase()}'S FIELD FAILURES WERE DENIED — ${house.name.toUpperCase()}'S REPUTATION TAKES A HIT`,
      causeId: inv?.causeEventId ?? null,
      delta: { quality: -BALANCE.qualityScandalPenalty },
      actorIsPlayer: true,
      subjectId: inv?.buyerId ?? null,
    })
  }
}

// Utan svar inom fristen räknas en öppen utredning som ett förnekande. Anropas i applyActions efter turens stående order,
// så ett svar samma tur vinner över standardförnekandet.
export function resolveOverdueInvestigations(ctx: ResolveContext): void {
  const { draft } = ctx
  for (const inv of investigationsOf(draft.house)) {
    if (inv.status !== 'open' || draft.meta.turn < inv.deadlineTurn) continue
    const name = (draft.house.designs.find((d) => d.id === inv.designId)?.name ?? inv.designId).toUpperCase()
    denyInvestigation(ctx, inv, `NO ANSWER TO THE INQUIRY INTO ${name} — TREATED AS A DENIAL`)
  }
}

// Markerar en omkonstruktions utredning som åtgärdad när projektet blir klart (upkeep.ts).
export function closeRedesignInvestigations(house: House, designId: string): void {
  for (const inv of house.investigations ?? []) {
    if (inv.designId === designId && inv.status === 'redesigning') inv.status = 'fixed'
  }
}
