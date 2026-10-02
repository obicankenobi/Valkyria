// art/silhouettes.mjs — siluettporträtt i profil (ETAPP10_FORSLAG.md beslut 10M, §11 punkt 3). En namngiven person får en profil i 1:1, ritad i
// papperskrämfärgad ram med mörk siluett, så att den fungerar som plats­hållare tills ägarens genererade porträtt (docs/GRAFISKA_TILLGANGAR_ETAPP7.md)
// kopplas in i samma ram under samma filnamn. Varje person har ett fåtal drag (kön, ålder, hår, glasögon, krage) hämtade ur porträttlistan och en
// liten seedad variation i näsa, haka och panna, så att två personer med samma drag ändå inte blir identiska. Fiktiva personer — ingen likhet med
// någon verklig människa avses, och ingen text finns i bilden.
import { createRandom, readPalette, round } from './core.mjs'

// Drag per person. age: young | mid | old. full: fylligare ansikte. Id:n följer porträttfilerna (official-<fraktion>-<post>, successor-<fraktion>-<n>).
export const PERSON_SPECS = {
  'official-rvn-procurement': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'tie' },
  'official-rvn-defence': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'uniform' },
  'official-rvn-finance': { sex: 'f', age: 'mid', hair: 'bun', glasses: true, collar: 'high' },
  'official-rvn-interior': { sex: 'm', age: 'old', hair: 'thin', glasses: false, collar: 'suit', full: true },
  'official-nlf-procurement': { sex: 'f', age: 'mid', hair: 'nape', glasses: false, collar: 'high' },
  'official-nlf-defence': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'high' },
  'official-nlf-finance': { sex: 'f', age: 'old', hair: 'knot', glasses: true, collar: 'suit' },
  'official-nlf-interior': { sex: 'm', age: 'young', hair: 'short', glasses: false, collar: 'open' },
  'official-laos-procurement': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'suit' },
  'official-laos-defence': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'uniform' },
  'official-laos-finance': { sex: 'm', age: 'mid', hair: 'short', glasses: true, collar: 'tie', full: true },
  'official-laos-interior': { sex: 'm', age: 'mid', hair: 'parted', glasses: false, collar: 'suit' },
  'successor-rvn-1': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'suit' },
  'successor-rvn-2': { sex: 'f', age: 'mid', hair: 'nape', glasses: false, collar: 'open' },
  'successor-nlf-1': { sex: 'm', age: 'young', hair: 'short', glasses: false, collar: 'open' },
  'successor-nlf-2': { sex: 'f', age: 'young', hair: 'braid', glasses: false, collar: 'high' },
  'successor-laos-1': { sex: 'm', age: 'mid', hair: 'short', glasses: false, collar: 'suit' },
  'successor-laos-2': { sex: 'm', age: 'mid', hair: 'parted', glasses: false, collar: 'suit' },
  // Rivalhusens ordförande (10M) — fiktiva; namnen sätts i P152, siluetterna väntar under id:t chairman-<hus>.
  'chairman-brandt': { sex: 'm', age: 'old', hair: 'thin', glasses: false, collar: 'tie', full: true },
  'chairman-costigan': { sex: 'm', age: 'mid', hair: 'parted', glasses: true, collar: 'tie' },
  'chairman-meridian': { sex: 'm', age: 'young', hair: 'short', glasses: false, collar: 'uniform' },
}

export const PERSON_IDS = Object.keys(PERSON_SPECS)

export function makeSilhouette(id, palette = readPalette()) {
  const spec = PERSON_SPECS[id]
  if (!spec) throw new Error(`ingen siluett för ${id}`)
  const rand = createRandom(`silhouette:${id}`)
  const jit = (amount) => (rand() - 0.5) * 2 * amount
  const female = spec.sex === 'f'
  const old = spec.age === 'old'
  const young = spec.age === 'young'

  // Profilen vänd åt höger. Alla mått i en 100×100-ruta; huvudet ligger kring (50,44).
  const front = round(73 + jit(1.2) + (spec.full ? 1 : 0)) // pannans x
  const noseX = round(female ? 79.5 + jit(1) : 82.5 + jit(1.4))
  const noseY = round(52 + jit(1))
  const chinX = round(front + 1 + (spec.full ? 0.5 : 0) + (female ? -1 : 0.8) + jit(1))
  const chinY = round(69 + (spec.full ? 2 : 0) + (old ? 1 : 0))
  const neckFront = female ? 57 : spec.full ? 62 : 60
  const neckBack = female ? 41 : 38
  const shoulderBack = 12

  // Siluetten, medurs från vänster axel: nacke, bakhuvud, hjässa, panna, näsa, läppar, haka, hals, bröst.
  const outline =
    `M${shoulderBack} 100V91Q16 79 ${neckBack - 4} 74L${neckBack} 66` +
    `C30 60 27 42 34 29C41 16 62 13 ${front - 2} 24C${front + 1} 28 ${front} 34 ${front} 38` +
    `L${round(front + 0.8)} 41L${round(front - 0.6)} 44L${noseX} ${noseY}L${round(front + 3)} ${round(noseY + 3.4)}` +
    `L${round(front + 4.2)} ${round(noseY + 6)}L${round(front + 1.6)} ${round(noseY + 8)}L${round(front + 3.8)} ${round(noseY + 10.4)}` +
    `L${chinX} ${chinY - 3}Q${chinX} ${chinY + 3} ${chinX - 7} ${chinY + 4}` +
    `L${neckFront + 2} ${chinY + 5}L${neckFront} ${chinY + 14}` +
    `Q${neckFront + 22} ${chinY + 17} 90 100Z`

  const dark = palette['ink']
  const paper = palette['panel-sunken'] ?? palette['bg']
  const light = palette['panel']
  const extras = []
  const strokes = []
  const hair = spec.hair
  // Hår: större siluett (skalle), eller en egen form bakom huvudet.
  if (hair === 'bun') extras.push(`<circle cx="35" cy="19" r="9"/>`)
  if (hair === 'knot') extras.push(`<circle cx="30" cy="54" r="8"/>`)
  if (hair === 'nape') extras.push(`<ellipse cx="32" cy="60" rx="6.5" ry="8"/>`)
  if (hair === 'braid') {
    strokes.push(`<path d="M33 34C24 46 22 64 30 80C34 90 38 98 44 100" fill="none" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>`)
  }
  if (!young && !female && (hair === 'short' || hair === 'parted')) extras.push(`<path d="M33 31C40 14 66 12 ${front - 2} 24L${front - 1} 30C60 20 44 22 36 40Z"/>`)
  // Detaljer i papper: hårfästet, örat, glasögon, krage och knappar.
  const details = []
  if (hair === 'short' || hair === 'parted' || hair === 'thin') {
    const lift = hair === 'thin' ? 6 : 0
    details.push(`<path d="M${front - 1} ${35 + lift}C66 ${26 + lift} 52 ${22 + lift} 42 ${33 + lift}" fill="none" stroke="${light}" stroke-width="1.4" stroke-linecap="round"/>`)
  }
  if (hair === 'parted') details.push(`<path d="M62 20L67 28" fill="none" stroke="${light}" stroke-width="1.4" stroke-linecap="round"/>`)
  if (hair === 'thin') details.push(`<path d="M36 38C38 30 44 26 49 27" fill="none" stroke="${light}" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 2"/>`)
  details.push(`<path d="M45 44C43 47 44 53 48 54" fill="none" stroke="${light}" stroke-width="1.5" stroke-linecap="round"/>`)
  if (spec.glasses) {
    details.push(`<circle cx="${round(front - 4)}" cy="45" r="4.3" fill="none" stroke="${light}" stroke-width="1.5"/>`)
    details.push(`<path d="M${round(front - 8.2)} 45L47 42" fill="none" stroke="${light}" stroke-width="1.5" stroke-linecap="round"/>`)
  }
  const cy = chinY + 14
  switch (spec.collar) {
    case 'suit':
      details.push(`<path d="M${neckBack + 6} ${cy - 4}L${neckFront - 2} ${cy + 1}L${neckFront + 4} ${cy + 10}L${neckBack + 12} ${cy + 8}Z" fill="${light}"/>`)
      details.push(`<path d="M${neckFront - 2} ${cy + 1}L${neckFront + 12} 100M${neckBack + 6} ${cy - 4}L${neckBack + 22} 100" fill="none" stroke="${paper}" stroke-width="1.6"/>`)
      break
    case 'tie':
      details.push(`<path d="M${neckBack + 6} ${cy - 4}L${neckFront - 2} ${cy + 1}L${neckFront + 4} ${cy + 10}L${neckBack + 12} ${cy + 8}Z" fill="${light}"/>`)
      details.push(`<path d="M${neckFront} ${cy + 4}L${neckFront + 5} ${cy + 8}L${neckFront + 3} 100L${neckFront - 1} 100Z" fill="${paper}"/>`)
      break
    case 'open':
      details.push(`<path d="M${neckBack + 8} ${cy - 3}L${neckFront - 1} ${cy + 2}L${neckFront + 8} ${cy + 9}L${neckBack + 10} ${cy + 12}Z" fill="${light}"/>`)
      break
    case 'high':
      details.push(`<path d="M${neckBack + 2} ${cy - 5}L${neckFront - 1} ${cy - 3}" fill="none" stroke="${light}" stroke-width="2.6" stroke-linecap="square"/>`)
      details.push(`<circle cx="${neckFront + 5}" cy="${cy + 6}" r="1.2" fill="${light}"/><circle cx="${neckFront + 8}" cy="${cy + 11}" r="1.2" fill="${light}"/>`)
      break
    case 'uniform':
      details.push(`<path d="M${neckBack + 4} ${cy - 5}L${neckFront - 1} ${cy - 3}L${neckFront + 2} ${cy + 6}L${neckBack + 8} ${cy + 4}Z" fill="none" stroke="${light}" stroke-width="1.5"/>`)
      details.push(`<circle cx="${neckFront + 9}" cy="${cy + 8}" r="1.3" fill="${light}"/><circle cx="${neckFront + 12}" cy="${cy + 14}" r="1.3" fill="${light}"/>`)
      break
    default:
      break
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" role="img" aria-hidden="true">` +
    `<rect width="100" height="100" fill="${paper}"/>` +
    `<ellipse cx="50" cy="46" rx="44" ry="46" fill="${palette['bg']}"/>` +
    `<g fill="${dark}">${extras.join('')}<path d="${outline}"/></g>${strokes.join('')}${details.join('')}` +
    `<rect x="1" y="1" width="98" height="98" fill="none" stroke="${palette['line-strong'] ?? palette['line']}" stroke-width="1.4"/>` +
    `</svg>\n`
  )
}
