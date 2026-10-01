// designNaming — beslut 9L: "H&V M64 Field Gun" = initialer + beteckning (M + årtal) + typ. Delas av husets konstruktioner
// (design.ts) och rivalernas (race.ts), så att namnen följer samma mall utan att design.ts och race.ts importerar varandra.
import type { TechCategory } from './types.js'

// Typnamn per kategori.
export const TYPE_NAME: Record<TechCategory, string> = {
  infantry: 'Rifle',
  artillery: 'Field Gun',
  armour: 'APC',
  aviation: 'Helicopter',
  naval: 'Patrol Boat',
  electronics: 'Radio Suite',
}

export function initialsOf(houseName: string): string {
  const words = houseName.split(/\s+/).filter((w) => w.length > 0 && w !== '&')
  const initials = words.map((w) => w[0]!.toUpperCase())
  return houseName.includes('&') ? initials.join('&') : initials.join('')
}

export function designDesignation(year: number): string {
  return `M${String(year % 100).padStart(2, '0')}`
}
