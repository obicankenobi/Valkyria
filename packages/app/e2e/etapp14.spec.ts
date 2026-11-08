// Etapp 14 (P204–P206): kartan och mapparna hänger ihop — i en riktig webbläsare, i skrivbordsformatet.
import { expect, test } from '@playwright/test'
import { enterOperations } from './screens'

test.use({ viewport: { width: 1440, height: 900 } })

test('P204: orderbrickan vid Saigon öppnar CONTRACTS filtrerat på köparen, och SHOW ALL tar bort filtret', async ({ page }) => {
  await page.goto('/')
  await enterOperations(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('end-quarter-button').click()
  await page.getByTestId('map-capital-orders-rvn').waitFor()
  await page.getByTestId('map-capital-orders-rvn').click()
  await expect(page.getByTestId('tab-contracts')).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('orders-filter')).toContainText('Orders from Republic of Vietnam')
  await page.getByTestId('orders-filter-clear').click()
  await expect(page.getByTestId('orders-filter')).toHaveCount(0)
})

test('P205: EXPAND FOLIO fäller ut THE COMPANY över kartan, och Esc fäller tillbaka utan att pausa', async ({ page }) => {
  await page.goto('/')
  await enterOperations(page)
  await page.getByTestId('tab-company').click()
  await page.getByTestId('folio-expand').click()
  await expect(page.getByTestId('desk-right-column')).toHaveClass(/is-folio-expanded/)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('desk-right-column')).not.toHaveClass(/is-folio-expanded/)
  await expect(page.locator('.pause-overlay')).toHaveCount(0)
  // Ett andra Esc pausar som förut (regel 16).
  await page.keyboard.press('Escape')
  await expect(page.locator('.pause-overlay')).toHaveCount(1)
})

test('P206: hovring över en förbandsbricka visar förbandets kort', async ({ page }) => {
  await page.goto('/')
  await enterOperations(page)
  await page.locator('[data-testid="map-formation-rvn-1st-infantry"] .map-token-tap').hover({ force: true })
  await expect(page.getByTestId('map-formation-hover')).toContainText('1st Infantry Division')
})
