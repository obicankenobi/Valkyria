// worksAlarms — P180 (ETAPP11_FORSLAG.md §8 punkt 5): larmen från verken som This Quarter visar. Tom linje, kontrakt som blir sent, underbemannat, dåligt skick, strejkrisk och
// färdigt bygge. Ren läsning ur state — samma funktioner som kortet och tavlan läser (en formel, en källa). Tal i balance.json (worksAlarm*).
import balanceData from './data/balance.json' with { type: 'json' }
import { productionBoard } from './capacity.js'
import { facilityCard } from './facilityCard.js'
import type { GameState } from './types.js'
import { allLines } from './works.js'

const BALANCE = balanceData as unknown as { worksAlarmUnderstaffedBelowPct: number }

export type WorksAlarmKind = 'empty-line' | 'late-contract' | 'understaffed' | 'poor-condition' | 'strike-risk' | 'build-done'

export interface WorksAlarm {
  id: string
  kind: WorksAlarmKind
  facilityId: string | null
  lineId: string | null
  contractId: string | null
  text: string
}

const READY = /\bIS (READY|MODERNISED)\b/

// Ett namn spelaren känner igen: "Assembly Works (artillery)" i stället för ett internt id.
const nameOf = (card: { label: string; category: string | null }): string => (card.category ? `${card.label} (${card.category})` : card.label)
const contractName = (id: string): string => `#${id.match(/(\d+)$/)?.[1] ?? id}`

export function worksAlarms(state: GameState): WorksAlarm[] {
  const out: WorksAlarm[] = []
  const house = state.house
  const turn = state.meta.turn

  // Bygge klart: en rubrik från senaste turen (anläggningens id står i subjectId).
  for (const event of state.wire) {
    if (event.turn !== turn - 1 || !event.subjectId || !READY.test(event.headline)) continue
    const card = facilityCard(state, event.subjectId)
    if (!card) continue
    out.push({ id: `build-done-${card.id}`, kind: 'build-done', facilityId: card.id, lineId: null, contractId: null, text: `${nameOf(card)} is ready` })
  }

  for (const works of house.works) {
    const card = facilityCard(state, works.id)
    if (!card) continue
    if (card.status === 'strike') {
      out.push({ id: `strike-risk-${card.id}`, kind: 'strike-risk', facilityId: card.id, lineId: null, contractId: null, text: `${nameOf(card)} is on strike` })
    } else if (card.staffing?.strikeRisk) {
      out.push({ id: `strike-risk-${card.id}`, kind: 'strike-risk', facilityId: card.id, lineId: null, contractId: null, text: `Morale at the ${nameOf(card)} is near the strike line` })
    }
    if (card.conditionLow) {
      out.push({ id: `poor-condition-${card.id}`, kind: 'poor-condition', facilityId: card.id, lineId: null, contractId: null, text: `${nameOf(card)} is in poor condition (${Math.round(card.condition ?? 0)})` })
    }
    if (card.staffing && card.status === 'operating' && card.staffing.current < BALANCE.worksAlarmUnderstaffedBelowPct) {
      out.push({ id: `understaffed-${card.id}`, kind: 'understaffed', facilityId: card.id, lineId: null, contractId: null, text: `${nameOf(card)} is at ${card.staffing.current}% of full strength` })
    }
  }

  const board = productionBoard(state)
  // Tom linje: en idle linje utan något att bygga (och en tur har gått, så startläget inte larmar).
  const hasWaiting = board.contracts.some((c) => !c.onLine && !c.subcontracted)
  if (turn >= 1 && !hasWaiting) {
    const empty = allLines(house).filter((line) => {
      if (line.status !== 'idle' || line.assignedContractId) return false
      const works = house.works.find((w) => w.lines.some((l) => l.id === line.id))
      return works !== undefined && works.status === 'operating'
    })
    // En rad för alla tomma linjer (inte en per linje): annars fylls listan av samma besked varje kvartal tills ett kontrakt vunnits.
    if (empty.length > 0) {
      const first = empty[0]!
      const works = house.works.find((w) => w.lines.some((l) => l.id === first.id))!
      out.push({
        id: 'empty-lines',
        kind: 'empty-line',
        facilityId: works.id,
        lineId: first.id,
        contractId: null,
        text: empty.length === 1 ? `${first.id.replace('line-', 'Line ')} has nothing to build` : `${empty.length} production lines have nothing to build`,
      })
    }
  }

  for (const contract of board.contracts) {
    if (!contract.late) continue
    out.push({ id: `late-contract-${contract.contractId}`, kind: 'late-contract', facilityId: null, lineId: contract.line, contractId: contract.contractId, text: `Contract ${contractName(contract.contractId)} will not be delivered by T${contract.dueTurn}` })
  }
  return out
}
