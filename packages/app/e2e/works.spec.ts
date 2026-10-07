// works.spec.ts — P179/P180 (ETAPP11_FORSLAG.md §8): i en riktig webbläsare går det att bygga från tomtplanen utan handling, bygget syns som en byggplats efter nästa kvartal, och ett
// verkslarm i This Quarter hoppar till anläggningens kort. Produktionstavlan tar emot ett planerat kontrakt.
import { expect, test } from '@playwright/test'
import { endQuarters, enterOperations, injectWorksState } from './screens'

test('ett bygge köas från en tom plats, kostar ingen handling och syns som byggplats efter kvartalet', async ({ page }) => {
  await page.goto('/')
  await enterOperations(page)
  await page.getByTestId('tab-company').click()

  const before = await page.locator('.works-slot.is-free').count()
  await page.locator('.works-slot.is-free').first().click()
  await page.getByTestId('build-option-depot').click()
  await page.getByTestId('build-file').click()

  // Köat: platsen visar "QUEUED", och ingen handlingspoäng gick åt.
  await expect(page.locator('.works-slot.is-queued')).toHaveCount(1)
  await expect(page.locator('.works-slot.is-free')).toHaveCount(before - 1)

  await endQuarters(page, 1)
  await page.getByTestId('tab-company').click()
  await expect(page.locator('.works-slot.is-queued')).toHaveCount(0)
  const site = page.locator('.works-slot.is-built .works-lamp.is-building')
  await expect(site).toHaveCount(1)
})

test('ett larm i This Quarter öppnar anläggningens kort, och ett sent kontrakt hoppar till produktionstavlan', async ({ page }) => {
  await page.goto('/')
  await injectWorksState(page)

  await page.getByTestId('quarterband-toggle').click()
  await page.getByTestId('quarterband-item-works-poor-condition-works-1').click()
  await expect(page.getByTestId('facility-card')).toBeVisible()
  await expect(page.getByTestId('facility-condition')).toContainText('18 / 100')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByTestId('quarterband-toggle').click()
  await page.getByTestId('quarterband-item-works-late-contract-contract-order-12').click()
  await expect(page.getByTestId('production-board')).toBeVisible()
  await expect(page.getByTestId('board-contract-contract-order-12')).toContainText('LATE')
})

test('ett kontrakt dras till en linje på produktionstavlan: planen köas utan handling', async ({ page }) => {
  await page.goto('/')
  await injectWorksState(page)
  await page.getByTestId('board-contract-contract-order-11').scrollIntoViewIfNeeded()
  await page.getByTestId('board-contract-contract-order-11').click()
  await page.getByTestId('contract-line').getByRole('radio', { name: 'L1' }).click()
  await page.getByTestId('contract-plan-file').click()
  await page.getByTestId('board-contract-contract-order-11').click()
  await expect(page.getByTestId('contract-queued')).toContainText('plan #11')
})
