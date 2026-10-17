// desk-yarn.spec.ts — P193 (ETAPP12, 12B/12C): kartan avmonteras aldrig när en mapp öppnas, och hovring på en tjänsteman spänner en röd tråd
// (DeskYarn) till landets nod på kartan. Tråden ska ha en giltig bana (två koordinater per punkt, inte ihopklistrade tal).
import { expect, test } from '@playwright/test'
import { enterOperations } from './screens'

test('kartan ligger kvar till vänster när varje mapp öppnas', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await enterOperations(page)
  for (const tab of ['contracts', 'company', 'contacts', 'news', 'operations']) {
    await page.getByTestId(`tab-${tab}`).click()
    await expect(page.getByTestId('theatre-map')).toBeVisible()
    const box = await page.getByTestId('theatre-map-svg').boundingBox()
    expect(box!.width, `kartans bredd med ${tab} öppen`).toBeGreaterThan(400)
  }
})

test('hovring på en tjänsteman i CONTACTS ritar den röda tråden till landet på kartan', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await enterOperations(page)
  await page.getByTestId('tab-contacts').click()
  await expect(page.getByTestId('desk-yarn-line')).toHaveCount(0)
  await page.locator('.faction-card').first().hover()
  const line = page.getByTestId('desk-yarn-line')
  await expect(line).toHaveCount(1)
  const d = (await line.getAttribute('d')) ?? ''
  expect(d).toMatch(/^M [\d.]+ [\d.]+ Q [\d.]+ [\d.]+ [\d.]+ [\d.]+$/)
  await page.mouse.move(5, 5)
  await expect(page.getByTestId('desk-yarn-line')).toHaveCount(0)
})
