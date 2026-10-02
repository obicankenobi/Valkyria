// sensitivityHook — en Node-laddningskrok (module.register) som byter innehållet i `…/data/balance.json` i den PROCESS som registrerar den.
// Det är så känslighetsverktyget (sensitivity.ts) ändrar ett balanstal utan att packages/core rörs: core importerar JSON-filen vid
// uppstart, och kroken levererar en skalad kopia i stället. Inget skrivs till disk, och filen på disk förblir orörd (golden läser den fryst).
import { scaleBalanceKey } from './sensitivity.js'
import type { BalanceData } from './sensitivity.js'

interface HookData {
  key: string
  factor: number
  // Tal som SÄTTS till ett fast värde (efter skalningen). Används av engångsmätningar som P141:s "vad händer om blocTechLevelStep slås på"
  // — samma mekanism, ingen core-ändring.
  set?: Record<string, unknown>
}

let override: HookData | null = null

export function initialize(data: HookData | undefined): void {
  override = data && (data.key || (data.set && Object.keys(data.set).length > 0)) ? data : null
}

interface LoadResult {
  format?: string
  source?: string | ArrayBuffer | Uint8Array
  shortCircuit?: boolean
}
type NextLoad = (url: string, context: unknown) => Promise<LoadResult>

export async function load(url: string, context: unknown, nextLoad: NextLoad): Promise<LoadResult> {
  const result = await nextLoad(url, context)
  if (!override || !url.endsWith('/data/balance.json') || result.source === undefined) return result
  const text = typeof result.source === 'string' ? result.source : new TextDecoder().decode(result.source as Uint8Array)
  const parsed = JSON.parse(text) as BalanceData
  const scaled = override.key ? scaleBalanceKey(parsed, override.key, override.factor) : parsed
  return { ...result, source: JSON.stringify({ ...scaled, ...(override.set ?? {}) }), shortCircuit: true }
}
