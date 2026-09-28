// text-overflow.spec.ts — regel 18 (CLAUDE.md, "Spelgränssnitt — regler
// (etapp 7)"): "Ingen text får överlappa annan text eller klippas av sin
// ruta. Kontrolleras automatiskt: ett Playwright-test går igenom varje
// textelement på varje skärm i båda formaten och underkänner om
// scrollWidth > clientWidth." Körs i CI (npm run test:e2e).
//
// Skärmlistan delar samma princip som scripts/shots.mjs: växer i takt med
// att fler etapp 7-skärmar färdigställs. P73 lade bara komponentsidan; P74
// lägger huvudmenyn och OPERATIONS-skalet (`setup` klickar igenom "New
// Game" — varje Playwright-test får en egen, tom browserkontext, så
// bekräftelsedialogen för att skriva över ett sparat parti aldrig visas här).
//
// Kartkollisionsdelen av regel 18 ("ett test över kartan underkänner om två
// etiketters eller markörers avgränsningsrutor skär varandra") läggs till i
// P76 (nedan, egen testloop) — TheatreMap.tsx:s sektoretiketter och
// frontlinjemarkörer är de enda element den delen av regeln gäller ännu
// (förbandsbrickor, stationer, ordermarkörer m.m. är senare prompter).
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const FORMATS: { name: string; width: number; height: number }[] = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
]

async function enterOperations(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('hud').waitFor()
}

// P86: CONTACTS — personakter med politikverben, faktionsverben (STAGE_
// INCIDENT/BACK_CHANNEL/FUND_COUP/BROKER) och rivalhusens akter, den
// textmässigt tätaste skärmen etapp 7 hittills byggt.
async function enterContacts(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('hud').waitFor()
  await page.getByTestId('tab-contacts').click()
  await page.getByTestId('contacts-verb-BROKER-rvn').waitFor()
}

// P87: krisens helskärmskort (§7.6) — sannolikhetsstyrd i ett riktigt parti
// (samma skäl play-20-turns.spec.ts har en adaptiv väntloop), så samma
// IndexedDB-injektion som scripts/shots.mjs:s "crisis"-skärm används här:
// skriv pendingCrisis direkt in i den redan autosparade "save:default"-
// posten (persistence.ts) och ladda om, i stället för att spela fram ett
// helt parti i varje CI-körning.
async function enterCrisis(page: Page): Promise<void> {
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('hud').waitFor()
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{ state: { theatres: Record<string, unknown>; meta: { turn: number }; doomsday: number; pendingCrisis: unknown } }>(
      (resolve, reject) => {
        getReq.onsuccess = () => resolve(getReq.result)
        getReq.onerror = () => reject(getReq.error)
      },
    )
    const theatreId = Object.keys(saved.state.theatres)[0]
    saved.state.doomsday = 82
    saved.state.pendingCrisis = { turn: saved.state.meta.turn, theatreId, restrictedRevenueThisTurn: 2_000_000 }
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('tab-news').click()
  await page.getByTestId('crisis-modal').waitFor()
}

const SCREENS: { name: string; path: string; setup?: (page: Page) => Promise<void> }[] = [
  { name: 'components', path: '/?screen=components' },
  { name: 'main-menu', path: '/' },
  { name: 'operations', path: '/', setup: enterOperations },
  { name: 'contacts', path: '/', setup: enterContacts },
  { name: 'crisis', path: '/', setup: enterCrisis },
]

for (const format of FORMATS) {
  for (const screen of SCREENS) {
    test(`ingen text klipps eller överlappar sin ruta — ${screen.name}, ${format.name} (regel 18)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto(screen.path)
      if (screen.setup) await screen.setup(page)
      await page.waitForTimeout(300)

      const offenders = await page.evaluate(() => {
        const found: string[] = []
        const all = document.body.querySelectorAll('*')
        for (const el of all) {
          const node = el as HTMLElement
          const style = window.getComputedStyle(node)
          // Inline-element rapporterar scrollWidth/clientWidth opålitligt (alltid 0
          // eller identiskt med sina barn) — bara block-liknande boxar har en egen
          // ruta att klippas av, vilket är precis vad regel 18 pratar om.
          if (style.display === 'inline' || style.display === 'none') continue
          // Bara element med EGEN direkt textnod (inte bara andra elements
          // wrapper) — annars flaggas containern för sina barns skull också.
          const hasDirectText = Array.from(node.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0,
          )
          if (!hasDirectText) continue
          if (node.scrollWidth > node.clientWidth + 1) {
            const label = (node.textContent ?? '').trim().slice(0, 50)
            const cls = node.className ? `.${String(node.className).split(' ').join('.')}` : ''
            found.push(`${node.tagName.toLowerCase()}${cls}: "${label}" (scrollWidth ${node.scrollWidth} > clientWidth ${node.clientWidth})`)
          }
        }
        return found
      })

      expect(offenders, `Textelement klipps av sin ruta:\n${offenders.join('\n')}`).toEqual([])
    })
  }
}

// Regel 11 (CLAUDE.md, "Spelgränssnitt — regler (etapp 7)"): "Träffytor minst
// 44×44 px." Samma komponentlista som ovan — växer i takt med fler skärmar.
for (const format of FORMATS) {
  for (const screen of SCREENS) {
    test(`alla träffytor minst 44×44 px — ${screen.name}, ${format.name} (regel 11)`, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto(screen.path)
      if (screen.setup) await screen.setup(page)
      await page.waitForTimeout(300)

      const tooSmall = await page.evaluate(() => {
        const found: string[] = []
        const interactive = document.body.querySelectorAll(
          'button, a[href], [role="slider"], [role="switch"], [role="radio"], [role="tab"]',
        )
        for (const el of interactive) {
          const node = el as HTMLElement
          if (window.getComputedStyle(node).display === 'none') continue
          const rect = node.getBoundingClientRect()
          if (rect.width === 0 && rect.height === 0) continue // inte renderad (t.ex. dold)
          if (rect.width < 44 || rect.height < 44) {
            const label = (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)
            found.push(`${node.tagName.toLowerCase()} "${label}": ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}`)
          }
        }
        return found
      })

      expect(tooSmall, `Träffytor under 44×44 px:\n${tooSmall.join('\n')}`).toEqual([])
    })
  }
}

// P81a (ETAPP7_TEKNISK_SPEC.md §13, P81-blockquoten): d3-zoom:s inbyggda
// hjulhantering, samma väg en riktig mus/styrplatta använder — ingen
// intern d3-state manipuleras direkt. Deltana är handräknade mot
// TheatreMap.tsx:s formel (k *= 2^(-deltaY/500)) och ZOOM_LEVEL_1_MAX/
// ZOOM_LEVEL_3_MIN/ZOOM_MIN/ZOOM_MAX, med marginal åt båda hållen.
async function setZoomLevel(page: Page, level: 1 | 2 | 3): Promise<void> {
  const svg = page.getByTestId('theatre-map-svg')
  const box = await svg.boundingBox()
  if (!box) throw new Error('kartan hittades inte')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const deltaY = level === 1 ? 400 : level === 3 ? -1000 : 0
  if (deltaY !== 0) await page.mouse.wheel(0, deltaY)
  await expect(svg).toHaveAttribute('data-zoom-level', String(level))
}

// Kartkollisionsdelen av regel 18, ordagrant "ett test över kartan
// underkänner om två etiketters eller markörers avgränsningsrutor skär
// varandra." Bara OPERATIONS har en karta — egen loop, inte SCREENS ovan.
// P76 byggde loopen bara för startzoomen (nivå 2) och bara sektoretiketter/
// frontlinjemarkörer. P81a (speltestet 2026-09-27, P81-1) utökar den till
// alla tre zoomnivåer och alla etikettyper — huvudstads- och förbandsnamn
// delar redan samma hiddenLabels-mekanism i TheatreMap.tsx (samma
// labelRefs-pool som sektoretiketterna), så det här är testtäckning för en
// mekanism som redan fanns, inte en ny en.
for (const format of FORMATS) {
  for (const level of [1, 2, 3] as const) {
    test(`kartan — inga etiketter eller markörer kolliderar, ${format.name}, zoomnivå ${level} (regel 18)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto('/')
      await enterOperations(page)
      await page.getByTestId('theatre-map-svg').waitFor()
      await page.waitForTimeout(300)
      await setZoomLevel(page, level)
      await page.waitForTimeout(300)

      const collisions = await page.evaluate(() => {
        // P81a: en dold etikett (TheatreMap.tsx:s .map-label-hidden,
        // visibility: hidden) stannar avsiktligt i DOM:en (geometrin krävs
        // för nästa omätning, se TheatreMap.tsx:s egen kommentar) — den ska
        // aldrig räknas som en kollision, spelaren ser den aldrig.
        const elements = [
          ...document.querySelectorAll(
            '.map-sector-label, .map-capital-label, .map-formation-label, .map-frontline-marker, .map-frontline-marker-trace',
          ),
        ].filter((el) => window.getComputedStyle(el).visibility !== 'hidden') as SVGGraphicsElement[]
        const boxes = elements.map((el) => ({ el, rect: el.getBoundingClientRect() }))
        const found: string[] = []
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!.rect
            const b = boxes[j]!.rect
            const overlaps = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
            if (overlaps) {
              const describe = (el: SVGGraphicsElement) =>
                `${el.tagName}.${el.getAttribute('class')}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`
              found.push(`${describe(boxes[i]!.el)} × ${describe(boxes[j]!.el)}`)
            }
          }
        }
        return found
      })

      expect(collisions, `Etikett-/markörkollisioner på kartan:\n${collisions.join('\n')}`).toEqual([])
    })
  }
}

// P81a: teckenförklaringen — tryck på symboler utan egna verb (heat-glöd,
// frontlinje, förbandsbricka, sektorfyllning) öppnar samma förklaring
// (regel 13, ingen information bara vid hovring).
test('kartan — legend-knappen och ett tryck på kartan öppnar teckenförklaringen', async ({ page }) => {
  // reducedMotion: heat-glödens "andas"-animation (map-heat-breathe, en
  // ständigt pågående CSS transform: scale()) gör elementet permanent
  // "instabilt" för Playwrights klickstabilitetskontroll — samma miljöfynd
  // P80 redan gjorde för NEWS DESK:s reveal-sekvens, bara en annan animation.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: FORMATS[0]!.width, height: FORMATS[0]!.height })
  await page.goto('/')
  await enterOperations(page)
  await page.getByTestId('theatre-map-svg').waitFor()
  await page.waitForTimeout(300)

  await expect(page.getByTestId('map-legend')).toHaveCount(0)
  await page.getByTestId('map-legend-button').click()
  await expect(page.getByTestId('map-legend')).toBeVisible()
  await page.getByTestId('map-legend').locator('.ds-sheet-close').click()
  await expect(page.getByTestId('map-legend')).toHaveCount(0)

  await page.getByTestId('map-heat-glow-tap-indochina').click()
  await expect(page.getByTestId('map-legend-row-heat')).toHaveClass(/is-focused/)
})
