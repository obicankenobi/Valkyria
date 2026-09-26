// sectorRegions — P76 (ETAPP7_TEKNISK_SPEC.md §6.2): "SECTOR_LAYOUTS ersätts
// av SECTOR_REGIONS: handritade polygoner per sektor med ett ankare på
// verklig koordinat." Data för DEN NYA geografiska kartan (TheatreMap.tsx) —
// `sectorLayout.ts`s SECTOR_LAYOUTS (godtyckliga 0–100-skärmkoordinater för
// den gamla schematiska tavlan, SectorBoard.tsx/TheWorld.tsx, retirerad av
// ägarbeslut A men inte bortstädad av den anledningen — den uppgiften nämner
// den här prompten inte) rörs inte och lämnas oförändrad.
//
// Ankarkoordinaterna är ordagrant §6.2:s tabell. Polygonerna är AVSIKTLIGT
// "handritade" — enkla, illustrativa områden runt varje ankare, inte
// härledda ur någon administrativ gränsdata (samma "ingen taktisk noggrannhet,
// ingen härledd geografi"-princip som redan gällde den gamla tavlan,
// DESIGN.md §18/§21). `deriveSectorControl` (queries.ts) rörs inte — den
// känner bara till sectorId, aldrig koordinater eller polygoner.
//
// Koordinater är [lat, lng] genomgående (samma ordning som §6.2:s tabell),
// vänt till [lng, lat] först vid projicering (d3-geo:s egen konvention) i
// TheatreMap.tsx — hålls [lat, lng] här så data läses i samma ordning som
// specen skriver den.
export interface SectorRegion {
  sectorId: string
  label: string
  anchor: [number, number] // [lat, lng]
  polygon: [number, number][] // [lat, lng][], sluten ring (första/sista punkten behöver inte upprepas)
}

// En enkel oktagon runt ankaret — den "handritade" blobben för de fem
// punktankrade sektorerna. radiusDeg är gradmått, inte kilometer (grov,
// avsiktligt godtycklig skala, samma anda som den gamla tavlans fasta
// pixelkoordinater).
function blob(lat: number, lng: number, radiusDeg: number): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    // Longitud skalas med cos(lat) så blobben inte blir avlång vid dessa breddgrader.
    const dLat = radiusDeg * Math.sin(angle)
    const dLng = (radiusDeg * Math.cos(angle)) / Math.cos((lat * Math.PI) / 180)
    points.push([lat + dLat, lng + dLng])
  }
  return points
}

const SECTOR_BLOB_RADIUS_DEG = 0.3

export const SECTOR_REGIONS: Record<string, SectorRegion[]> = {
  indochina: [
    {
      sectorId: 'hue',
      label: 'HUE',
      anchor: [16.46, 107.59],
      polygon: blob(16.46, 107.59, SECTOR_BLOB_RADIUS_DEG),
    },
    {
      sectorId: 'da-nang',
      label: 'DA NANG',
      anchor: [16.05, 108.21],
      polygon: blob(16.05, 108.21, SECTOR_BLOB_RADIUS_DEG),
    },
    {
      sectorId: 'an-loc',
      label: 'AN LOC',
      anchor: [11.65, 106.6],
      polygon: blob(11.65, 106.6, SECTOR_BLOB_RADIUS_DEG),
    },
    {
      sectorId: 'cu-chi',
      label: 'CU CHI',
      anchor: [10.97, 106.49],
      polygon: blob(10.97, 106.49, SECTOR_BLOB_RADIUS_DEG),
    },
  ],
  laos: [
    {
      sectorId: 'plain-of-jars',
      label: 'PLAIN OF JARS',
      anchor: [19.45, 103.18],
      polygon: blob(19.45, 103.18, SECTOR_BLOB_RADIUS_DEG),
    },
    // §6.2, ordagrant: "korridor i östra Laos, ca 15–17° N, 106–107° E, ritas
    // som band" — inte en blob, ett smalt, avlångt band längs korridoren.
    // Ankaret är bandets mittpunkt.
    {
      sectorId: 'ho-chi-minh-trail',
      label: 'HO CHI MINH TRAIL',
      anchor: [16, 106.5],
      polygon: [
        [17, 106.9],
        [16.6, 106.6],
        [16, 106.35],
        [15.4, 106.15],
        [15, 106.0],
        [15.3, 105.7],
        [15.9, 105.95],
        [16.5, 106.2],
        [17, 106.5],
      ],
    },
  ],
}
