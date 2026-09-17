// officials.ts — rena hjälpfunktioner kring Official, delade av state.ts (uppresning),
// resolve-stegen som läser/skriver tjänstemän (orders.ts, bidding.ts, queries.ts, och
// från P56/P57 applyActions.ts/politics.ts) och testerna. Samma nivå som pricing.ts/
// money.ts — inga steg, ingen wire, ingen rng här. Se ETAPP5_TEKNISK_SPEC.md avsnitt 3.1.
import type { Agenda, FactionId, GameState, Official, OfficialId, Post } from './types.js'

// Samma id-schema överallt (state.ts:s uppresning, och varje anropsställe som
// letar upp en specifik post) — ett stabilt, läsbart id, inte ett löpnummer.
export function officialId(factionId: FactionId, post: Post): OfficialId {
  return `official-${factionId}-${post}`
}

// Den vanliga uppslagningen: "faktionens tjänsteman för den här posten." Alla tre
// (orders.ts, bidding.ts, queries.ts) letar upp samma sak — samma faktion, samma
// post — bara vid olika tillfällen i pipelinen.
export function findOfficial(state: Pick<GameState, 'officials'>, factionId: FactionId, post: Post): Official | undefined {
  return state.officials[officialId(factionId, post)]
}

// P54 klart-når, tredje punkten: en fallen tjänsteman ersätts av en ny med ny
// integrity, ny agenda och relationToPlayer nollställd. Ren transformation —
// VEM den nya personen är (namn/integrity/agenda/standing) avgörs av anroparen
// (en resolve-steg med tillgång till ctx.rng och ett namnregister), inte här.
// Inget sådant anropsställe finns ännu i P54 (se avsnitt 8: den faktiska
// utlösaren — standing som faller till 0, skandal — hör till P56/P57) — funktionen
// finns för att testas isolerat nu och kopplas in när en verklig orsak att falla
// finns.
export function replaceOfficial(
  fallen: Official,
  replacement: { name: string; integrity: Official['integrity']; standing: Official['standing']; agenda: Agenda },
): Official {
  return {
    ...fallen,
    name: replacement.name,
    integrity: replacement.integrity,
    standing: replacement.standing,
    agenda: replacement.agenda,
    relationToPlayer: 0,
    status: 'active',
    // P56 (avsnitt 3.3): scandalRisk hör till PERSONEN (byggs upp av BRIBE mot
    // just henne) — en ny person har ingen skandalhistorik att ärva.
    scandalRisk: 0,
  }
}
