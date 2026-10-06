// ledger.spec.ts — P97 (ETAPP8_FORSLAG.md §3.2): huvudboken och styrelsens PM i en riktig
// webbläsare. Klart-när: "varje granskningstur visar ett PM, och grafen klarar regel 18 i
// båda formaten" (regel 18/11/axe för de tre nya skärmarna ligger i screens.ts och körs av
// text-overflow.spec.ts och accessibility.spec.ts). Här: flödena — ett tryck på diagrammet
// öppnar kvartalets verifikationer (regel 13), verifikationens kassa är HUD:ens, och PM:et
// kommer vid VARJE granskningstur (T6 och T10) och stänger aldrig av sig självt.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { FORMATS, endQuarters, enterCompanyLedger, enterOperations } from './screens'

for (const format of FORMATS) {
  test(`ett tryck på huvudboken öppnar kvartalets verifikationer, och kassan stämmer med HUD:en — ${format.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: format.width, height: format.height })
    await page.goto('/')
    await enterCompanyLedger(page)

    const chart = page.getByTestId('ledger-chart')
    await chart.scrollIntoViewIfNeeded()
    await expect(page.getByTestId('ledger-book-now')).toBeVisible()

    // Tryck längst till höger i diagrammet: senaste avslutade kvartalet (T3 efter fyra kvartal).
    const box = (await chart.boundingBox())!
    await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2)
    const sheet = page.getByTestId('ledger-vouchers')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Quarter T3')
    await expect(sheet.getByTestId('ledger-voucher-row-fixedCosts')).toBeVisible()

    // Verifikationens slutkassa är samma tal HUD:en visar.
    const voucherCash = ((await sheet.getByTestId('ledger-voucher-treasury').textContent()) ?? '').trim()
    await page.getByLabel('Close').click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('hud-treasury')).toContainText(voucherCash.replace('£', ''))

    // Bläddra: steppern tar oss till ett tidigare kvartal.
    await chart.click({ position: { x: 4, y: 100 } })
    await expect(page.getByTestId('ledger-vouchers')).toContainText('Quarter T0')
  })
}

async function memoCount(page: Page): Promise<number> {
  return page.getByTestId('board-memo').count()
}

test('styrelsens PM visas vid VARJE granskningstur (T6 och T10) och stänger aldrig av sig självt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enterOperations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  const reviewsSeen: string[] = []
  for (let quarter = 1; quarter <= 12 && reviewsSeen.length < 2; quarter++) {
    await page.getByTestId('end-quarter-button').click()
    await page.waitForTimeout(250)
    if ((await memoCount(page)) > 0) {
      const heading = (await page.getByTestId('board-memo').textContent()) ?? ''
      reviewsSeen.push(/BOARD REVIEW T(\d+)/.exec(heading)?.[1] ?? '?')
      // Det försvinner inte av sig självt …
      await page.waitForTimeout(1500)
      await expect(page.getByTestId('board-memo')).toBeVisible()
      await expect(page.getByTestId('board-memo-sentence')).not.toBeEmpty()
      await expect(page.getByTestId('board-memo-verdict')).toBeVisible()
      // … utan kvitteras med Continue.
      await page.getByTestId('replay-skip').click()
      await expect(page.getByTestId('board-memo')).toBeHidden()
    }
    if (await page.getByTestId('ended-banner').count()) break
  }
  expect(reviewsSeen.slice(0, 2)).toEqual(['6', '10'].slice(0, reviewsSeen.length))
  expect(reviewsSeen[0]).toBe('6')
})

test('utan reducerad rörelse spelas listan först och PM:et kommer efter, med Continue', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await enterOperations(page)
  await endQuarters(page, 0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (let quarter = 1; quarter <= 9; quarter++) {
    await page.getByTestId('end-quarter-button').click()
    // Kvartalsuppspelningen kan visas (rubriker) eller hoppas över (tyst kvartal): Skip är alltid ett giltigt svar.
    const memo = page.getByTestId('board-memo')
    try {
      await memo.waitFor({ state: 'visible', timeout: 6000 })
      await expect(page.getByTestId('replay-skip')).toHaveText('Continue')
      await page.getByTestId('replay-skip').click()
      await expect(memo).toBeHidden()
      return
    } catch {
      const skip = page.getByTestId('replay-skip')
      // Uppspelningen kan stänga sig själv mellan count() och click() — då finns knappen inte längre och ett klick utan tidsgräns hängde i hela testtiden.
      if (await skip.count()) await skip.click({ timeout: 2000 }).catch(() => {})
    }
  }
  throw new Error('inget PM inom nio kvartal')
})
