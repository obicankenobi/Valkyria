// P11 klart-när (ETAPP1_TEKNISK_SPEC.md avsnitt 10): "du kan spela 20 turer i
// webbläsaren utan att öppna konsolen" — verifierat här som "inga console.error
// eller ofångade sidfel under 20 turer", i en riktig (headless) webbläsare mot
// den faktiskt byggda bunten, inte en jsdom-simulering.
import { expect, test } from '@playwright/test'

test('spela 20 turer utan konsolfel', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'THE SEVENTH FRONT' })).toBeVisible()

  for (let turn = 0; turn < 20; turn++) {
    const endTurnButton = page.getByRole('button', { name: /Avsluta tur/ })
    if (await endTurnButton.isDisabled()) break // partiet redan slut (en ending inträffade tidigare)

    await page.getByRole('button', { name: /THE FLOOR/ }).click()

    // Lägg ett bud på varje öppen order den här turen — övar hela vägen genom
    // bidEstimate/winBand-uträkningen och submit-flödet, inte bara navigering.
    while ((await page.getByRole('button', { name: 'bjud' }).count()) > 0) {
      await page.getByRole('button', { name: 'bjud' }).first().click()
      await page.getByLabel('Pris').first().fill('5000000')
      await page
        .getByRole('button', { name: /Lägg bud/ })
        .first()
        .click()
    }

    await endTurnButton.click()
  }

  expect(errors).toEqual([])
})
