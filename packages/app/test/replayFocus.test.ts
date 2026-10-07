// replayFocus.test.ts — P158 (ETAPP10_FORSLAG.md §11 punkt 1): kvartalsuppspelningen pekar ut var på kartan varje händelse hör hemma. Anker → kartkoordinat är en ren funktion
// (`replayGeoAnchor`) som läser samma geometri kartan ritar (frontlinjens markör, huvudstäder, NLF:s sektorer).
import { describe, expect, it } from 'vitest'
import { createInitialState } from '@seventh-front/core'
import { replayGeoAnchor, replayKind } from '../src/replayFocus.js'
import { CAPITALS } from '../src/capitals.js'
import { SECTOR_REGIONS } from '../src/sectorRegions.js'
import { interpolateFrontGeoPosition } from '../src/geoMath.js'

const state = () => createInitialState('indochina-slice', 'replay-focus')

describe('replayGeoAnchor — var på kartan en händelse hör hemma', () => {
  it('en front pekar på frontlinjens markör (samma interpolation som kartan ritar)', () => {
    const s = state()
    const front = Object.values(s.fronts)[0]!
    expect(replayGeoAnchor(s, { kind: 'sector', id: front.id })).toEqual(interpolateFrontGeoPosition(SECTOR_REGIONS[front.theatreId]!, front.position))
  })

  it('en teater (id:t är ett teater-id, inte en front) pekar på dess första fronts markör', () => {
    const s = state()
    const front = Object.values(s.fronts)[0]!
    const viaTheatre = replayGeoAnchor(s, { kind: 'sector', id: front.theatreId })
    expect(viaTheatre).toEqual(replayGeoAnchor(s, { kind: 'sector', id: front.id }))
  })

  it('ett land pekar på dess huvudstad; en station på stationslandets huvudstad', () => {
    const s = state()
    const saigon = CAPITALS.find((c) => c.factionId === 'rvn')!
    expect(replayGeoAnchor(s, { kind: 'country', id: 'rvn' })).toEqual(saigon.anchor)
    expect(replayGeoAnchor(s, { kind: 'station', id: s.house.stations[0]!.id })).toEqual(saigon.anchor)
  })

  it('ett land utan huvudstad men med egna förband (NLF) pekar på förbandens medelpunkt; utan förband: ingenting', () => {
    const s = state()
    const nlf = replayGeoAnchor(s, { kind: 'country', id: 'nlf' })
    expect(nlf).not.toBeNull()
    const [lat, lng] = nlf!
    expect(lat).toBeGreaterThan(5)
    expect(lng).toBeGreaterThan(95)
    for (const front of Object.values(s.fronts)) for (const f of front.formations) if (f.factionId === 'nlf') f.status = 'destroyed'
    expect(replayGeoAnchor(s, { kind: 'country', id: 'nlf' })).toBeNull()
  })

  it('en husövergripande händelse (HUD) och ett okänt id har ingen plats på kartan', () => {
    const s = state()
    expect(replayGeoAnchor(s, { kind: 'hud', id: 'hud' })).toBeNull()
    expect(replayGeoAnchor(s, { kind: 'sector', id: 'nowhere' })).toBeNull()
    expect(replayGeoAnchor(s, { kind: 'country', id: 'nowhere' })).toBeNull()
    expect(replayGeoAnchor(s, { kind: 'station', id: 'nowhere' })).toBeNull()
  })
})

describe('replayKind — hur ringen ritas', () => {
  const ev = (headline: string, severity: 'headline' | 'report' | 'ticker' = 'headline') => ({ id: 'e', turn: 1, headline, severity, scope: 'front', causeId: null, delta: {}, actorIsPlayer: false, subjectId: null })
  it('en blixthändelse (genombrott, kris, slut) är en blixt; övriga rubriker en vanlig ring, och en ticker en liten', () => {
    expect(replayKind(ev('BREAKTHROUGH ON THE NORTH FRONT — POSITION SHIFTS 12 → 20') as never)).toBe('flash')
    expect(replayKind(ev('SOMETHING HAPPENS') as never)).toBe('headline')
    expect(replayKind(ev('LINE-1 PRODUCES 4× X', 'ticker') as never)).toBe('minor')
  })
})
