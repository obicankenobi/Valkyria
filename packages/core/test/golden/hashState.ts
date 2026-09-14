// hashState — stabil hash över GameState. Se ETAPP1_5_TEKNISK_SPEC.md avsnitt
// 11.3: "sorterade nycklar, inga flyttalsartefakter".
//
// Sorterade nycklar: JSON.stringify:s ordning följer annars insättningsordning
// (objektliteraler) — två bitvis identiska states kunde annars hasha olika bara
// för att fälten byggdes i olika ordning. Inga flyttalsartefakter: talen i
// GameState är i praktiken redan avrundade (Money via money.ts, Pct-värden
// via Math.round/clamp i varje steg) men avrundas ändå EN gång till här
// (8 decimaler) som en andra försäkring mot t.ex. 0.1+0.2-artefakter någon
// framtida formel råkar introducera — snapshotet ska bara gå sönder när en
// REGEL ändras (CLAUDE.md), aldrig av en flyttalsimplementationsdetalj.
//
// Ingen extern hash-dependency: en enda testfixtur behöver ingen kryptografisk
// hash, bara en stabil, kollisionsfattig sträng. cyrb53 (allmänt känd, public
// domain-algoritm) räcker gott för det.
function stableStringify(value: unknown): string {
  return JSON.stringify(sortAndRound(value))
}

function sortAndRound(value: unknown): unknown {
  if (typeof value === 'number') {
    // Runda bort flyttalsbrus utan att förlora meningsfull precision — alla
    // GameState-tal är redan heltal eller Pct/andra tal med högst ett par
    // decimalers verklig betydelse.
    return Number.isFinite(value) ? Math.round(value * 1e8) / 1e8 : value
  }
  if (Array.isArray(value)) {
    return value.map(sortAndRound)
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortAndRound((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

// cyrb53 — Bryc, public domain. https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export function hashState(state: unknown): string {
  return cyrb53(stableStringify(state))
}
