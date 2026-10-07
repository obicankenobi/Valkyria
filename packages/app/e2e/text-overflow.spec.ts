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

import { FORMATS, SCREENS, enterOperations } from './screens'

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
          // SVG-text har ingen CSS-ruta: scrollWidth/clientWidth är avrundade och orelaterade till vad som ritas (ett enda siffertecken
          // gav scrollWidth 4 > clientWidth 2 trots att inget klipptes). Samma fynd som P77:s frågetecken. SVG-texter prövas i stället
          // mot sin omgivande form här nedan och mot varandra i kartans egen kollisionsloop.
          if (node instanceof SVGElement) continue
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
        // Ordermärkets siffra ska rymmas i sin cirkel (SVG: jämför avgränsningsrutan med cirkelns diameter, inte scrollWidth).
        for (const text of document.querySelectorAll('.map-capital-badge-text')) {
          const circle = text.parentElement?.querySelector('circle')
          if (!circle) continue
          const box = (text as SVGGraphicsElement).getBBox()
          const diameter = Number(circle.getAttribute('r')) * 2
          if (box.width > diameter + 0.5 || box.height > diameter + 0.5) {
            found.push(`text.map-capital-badge-text: "${(text.textContent ?? '').trim()}" (bredd ${box.width.toFixed(1)} × höjd ${box.height.toFixed(1)} > cirkeln ${diameter})`)
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

// P166: gemensam kollisionskontroll — används både vid startläget och med varje kartlager påslaget.
async function findMapCollisions(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    // P81a: en dold etikett (TheatreMap.tsx:s .map-label-hidden,
    // visibility: hidden) stannar avsiktligt i DOM:en (geometrin krävs
    // för nästa omätning, se TheatreMap.tsx:s egen kommentar) — den ska
    // aldrig räknas som en kollision, spelaren ser den aldrig.
    const elements = [
      ...document.querySelectorAll(
        '.map-sector-label, .map-capital-label, .map-formation-label, .map-frontline-marker, .map-frontline-marker-trace, .map-layer-tag, .map-front-status-label, .map-landless-label, .map-works-marker',
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
}

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

      const collisions = await findMapCollisions(page)

      expect(collisions, `Etikett-/markörkollisioner på kartan:\n${collisions.join('\n')}`).toEqual([])
    })
  }
}

// P81a/P165: teckenförklaringen öppnas BARA från sin egen knapp. Ett tryck på en symbol på kartan (heat-glöd, frontlinje, förband, sektor, land) väljer den och visar
// ett informationskort i kartans nederkant — kartan ligger kvar ovanför, ingen bottenark täcker den.
test('kartan — legend-knappen öppnar teckenförklaringen, ett tryck på kartan visar ett kort', async ({ page }) => {
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
  await expect(page.getByTestId('map-info-card')).toBeVisible()
  await expect(page.getByTestId('map-info-kicker')).toHaveText('THEATRE')
  await expect(page.getByTestId('map-legend')).toHaveCount(0)
  // Kartan syns fortfarande ovanför kortet, och kortet täcker inte den.
  const map = await page.getByTestId('theatre-map-svg').boundingBox()
  const cardBox = await page.getByTestId('map-info-card').boundingBox()
  expect(map!.y + map!.height).toBeLessThanOrEqual(cardBox!.y + 1)
})

// P165: alla länder är tryckbara. Ett sammanhangsland ger ett kort utan väg in i en landsakt.
test('kartan — ett tryck på Kambodja visar ett kort utan landsakt', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: FORMATS[0]!.width, height: FORMATS[0]!.height })
  await page.goto('/')
  await enterOperations(page)
  await page.getByTestId('theatre-map-svg').waitFor()
  await page.getByTestId('map-country-thailand').dispatchEvent('click')
  await expect(page.getByTestId('map-info-title')).toHaveText('Thailand')
  await expect(page.getByTestId('map-info-open-file')).toHaveCount(0)
})

// P166: med varje kartlager påslaget får inga taggar, etiketter eller markörer krocka — i båda formaten, på startzoomen.
for (const format of FORMATS) {
  for (const layer of ['orders', 'supply', 'rivals', 'intelligence', 'politics'] as const) {
    test(`kartan — lagret ${layer} kolliderar inte med etiketterna, ${format.name} (regel 18)`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto('/')
      await enterOperations(page)
      await page.getByTestId('theatre-map-svg').waitFor()
      await page.waitForTimeout(300)
      await page.getByTestId(`map-layer-${layer}`).click()
      await expect(page.getByTestId(`map-layer-${layer}`)).toHaveAttribute('aria-pressed', 'true')
      await page.waitForTimeout(300)
      const collisions = await findMapCollisions(page)
      expect(collisions, `Kollisioner med lagret ${layer}:\n${collisions.join('\n')}`).toEqual([])
    })
  }
}
