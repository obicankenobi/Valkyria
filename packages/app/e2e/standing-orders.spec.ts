// standing-orders.spec.ts — P101 (ETAPP8_FORSLAG.md §5.2), klart-när ordagrant: "alla tre slag går att sätta
// och ändra från tavlan, och ett larm hoppar från This Quarter till rätt kort." Kostar ingen handling och
// gäller från nästa kvartal.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function startFreshGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('menu-continue').waitFor()
  await page.waitForTimeout(300)
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('seventh-front')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      }),
  )
  await page.reload()
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await expect(page.getByTestId('hud')).toBeVisible()
  await page.getByTestId('tab-company').click()
  await expect(page.getByTestId('standing-orders-board')).toBeVisible()
}

async function endQuarter(page: Page): Promise<void> {
  await page.getByTestId('end-quarter-button').click()
  await page.waitForTimeout(200)
}

test('alla tre slag går att sätta från tavlan, köas utan handling och gäller efter nästa kvartal', async ({ page }) => {
  await startFreshGame(page)

  // 1) Linjeuppdrag: linje 1 → artilleri, övertid.
  await page.getByTestId('standing-flip-line-1').click()
  await page.getByTestId('standing-card-line-1').getByRole('radio', { name: 'ART' }).click()
  await page.getByTestId('standing-card-line-1').getByRole('radio', { name: 'OVERTIME' }).click()
  await page.getByTestId('standing-set-line-1').click()

  // 2) Leverantörsavtal: stål.
  await page.getByTestId('standing-flip-supply-new').click()
  await page.getByTestId('standing-card-supply-new').getByRole('radio', { name: 'STEEL' }).click()
  await page.getByTestId('standing-set-supply-new').click()

  // 3) Stationsläge: aktiv.
  await page.getByTestId('standing-flip-station-1').click()
  await page.getByTestId('standing-card-station-1').getByRole('radio', { name: 'ACTIVE' }).click()
  await page.getByTestId('standing-set-station-1').click()

  // Köade, väntande — och ingen handlingsplats togs i anspråk (dockan är bara på OPERATIONS; regeln
  // bevisas av att kvartalet avgörs utan avvisning).
  for (const id of ['line-1', 'supply-new', 'station-1']) {
    await expect(page.getByTestId(`standing-card-${id}`)).toContainText('PENDING')
  }

  await endQuarter(page)
  await expect(page.getByTestId('rejected-banner')).toHaveCount(0)

  await page.getByTestId('tab-company').click()
  await expect(page.getByTestId('standing-card-line-1')).toContainText('OVERTIME')
  await expect(page.getByTestId('standing-card-line-1')).toContainText('ARTILLERY')
  await expect(page.getByTestId('standing-card-supply-steel')).toBeVisible()
  await expect(page.getByTestId('standing-card-station-1')).toContainText('ACTIVE')
})

test('ett larm hoppar från This Quarter till rätt kort på tavlan, som öppnas', async ({ page }) => {
  await startFreshGame(page)
  await page.evaluate(async () => {
    const dbReq = indexedDB.open('seventh-front', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      dbReq.onsuccess = () => resolve(dbReq.result)
      dbReq.onerror = () => reject(dbReq.error)
    })
    const tx = db.transaction('saves', 'readwrite')
    const store = tx.objectStore('saves')
    const getReq = store.get('save:default')
    const saved = await new Promise<{
      state: { meta: { turn: number }; house: { standingOrders: { supply: unknown[] } } }
    }>((resolve, reject) => {
      getReq.onsuccess = () => resolve(getReq.result)
      getReq.onerror = () => reject(getReq.error)
    })
    saved.state.meta.turn = 8
    saved.state.house.standingOrders.supply = [
      { id: 'supply-steel-1', commodity: 'steel', volumePerTurn: 40000, lockedIndex: 100, startTurn: 1, endTurn: 20, lossStreak: 3 },
    ]
    await new Promise((resolve, reject) => {
      const putReq = store.put(saved, 'save:default')
      putReq.onsuccess = () => resolve(undefined)
      putReq.onerror = () => reject(putReq.error)
    })
  })
  await page.reload()
  await page.getByTestId('menu-continue').click()
  await page.getByTestId('hud').waitFor()

  await page.getByTestId('quarterband-toggle').click()
  await page.getByTestId('quarterband-item-standing-supply-steel').click()

  await expect(page.getByTestId('standing-card-supply-steel')).toBeVisible()
  await expect(page.getByTestId('standing-back-supply-steel')).toBeVisible()
  await expect(page.getByTestId('standing-alarm-supply-steel')).toBeVisible()
})
