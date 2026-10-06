// staffRoles — P162 (ETAPP10_FORSLAG.md §3b): vad varje anställningsbar roll gör och var dess tröskel ligger. En anställning (`HIRE`) höjer
// rollen med HIRE_GAIN men gör ingenting förrän värdet PASSERAR tröskeln — det ska stå på kortet. Trösklarna ligger i kärnan (balance.json för
// ingenjören och stabschefen, hårdkodad 75 i queries.ts för försäljaren); appen speglar dem här och test/staffRoles.test.tsx binder
// spegeln mot kärnan, så att den inte kan glida.
import type { HirableRole } from '@seventh-front/core'

export const HIRE_GAIN = 15 // balance.json: hireGain

export interface StaffRoleInfo {
  label: string
  threshold: number // rollen måste vara HÖGRE än detta
  effect: string // vad som gäller när tröskeln är passerad
}

export const STAFF_ROLES: Record<HirableRole, StaffRoleInfo> = {
  chiefEngineer: {
    label: 'Chief engineer',
    threshold: 70,
    effect: 'R&D projects finish one quarter sooner, and new designs are less likely to carry a hidden flaw.',
  },
  chiefSalesman: {
    label: 'Chief salesman',
    threshold: 75,
    effect: 'Your intelligence counts one level deeper in every country: narrower price bands, clearer buyer terms and more detail on formations and officials.',
  },
  chiefOfStaff: {
    label: 'Chief of staff',
    threshold: 70,
    effect: 'You get 4 executive actions each quarter instead of 3.',
  },
}

export interface HireOutlook {
  current: number
  after: number // värdet efter EN anställning, klampat vid 100
  threshold: number
  activeNow: boolean
  activeAfter: boolean
  hiresToActivate: number // anställningar kvar innan effekten börjar gälla (0 om den redan gäller)
}

export function hireOutlook(role: HirableRole, current: number): HireOutlook {
  const { threshold } = STAFF_ROLES[role]
  const after = Math.min(100, current + HIRE_GAIN)
  const activeNow = current > threshold
  const hiresToActivate = activeNow ? 0 : Math.ceil((threshold + 1 - current) / HIRE_GAIN)
  return { current, after, threshold, activeNow, activeAfter: after > threshold, hiresToActivate }
}
