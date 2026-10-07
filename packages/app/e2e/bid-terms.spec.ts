// bid-terms.spec.ts — P99 (ETAPP8_FORSLAG.md §4.2). Klart-när, ordagrant: "alla tre syns utan att
// mappen scrollas på 390×844". Alla tre = förskottsstämpeln, kreditstämpeln och talet för pengar i
// kassan nästa kvartal (plus vinstchans och marginal, som sitter i samma remsa). Testet öppnar en
// riktig ordermapp, ställer mappens topp i överkant av innehållsytan och kräver att allt ligger
// inom den — det vill säga att spelaren ser hela avvägningen utan att skrolla.
import { expect, test } from '@playwright/test'

import { FORMATS, biddableFolders, enterContractsBidOpen } from './screens'

for (const format of FORMATS) {
  test(`förskottsstämpel, kreditstämpel och kassatalen syns utan att mappen skrollas — ${format.name} (${format.width}×${format.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: format.width, height: format.height })
    await page.goto('/')
    await enterContractsBidOpen(page)

    const folder = biddableFolders(page).first()
    // Mappens topp i överkanten av innehållsytan: ingen del av mappen får behöva skrollas in.
    await folder.evaluate((el) => el.scrollIntoView({ block: 'start' }))
    const content = (await page.locator('.ds-shell-content').boundingBox())!

    const targets = ['credit-stamp', 'order-advance-stamp', 'your-win-chance', 'readout-margin', 'readout-cash']
    for (const id of targets) {
      const box = await folder.getByTestId(id).boundingBox()
      expect(box, `${id} renderas inte`).not.toBeNull()
      expect(box!.y, `${id} börjar ovanför innehållsytan`).toBeGreaterThanOrEqual(content.y - 1)
      expect(box!.y + box!.height, `${id} ligger under innehållsytans nederkant — mappen måste skrollas`).toBeLessThanOrEqual(
        content.y + content.height + 1,
      )
    }

    // Innehåll, inte bara närvaro.
    await expect(folder.getByTestId('order-advance-stamp')).toHaveText(/(Advance \d+ %|No advance)/i)
    await expect(folder.getByTestId('credit-stamp')).toHaveText(/^[ABC?]$/)
    await expect(folder.getByTestId('readout-cash')).toContainText('advance, if won')
    await expect(folder.getByTestId('readout-cash')).toContainText('+£')
  })
}

test('kassatalet följer prisreglaget: högsta priset ger mer förskott än lägsta', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await enterContractsBidOpen(page)
  const cash = page.getByTestId('readout-cash')
  const read = async () => Number(((await cash.locator('.bid-readout-value').textContent()) ?? '').replace(/[^0-9]/g, ''))

  const slider = page.getByRole('slider', { name: 'Price' })
  await slider.focus()
  await page.keyboard.press('Home')
  const low = await read()
  await page.keyboard.press('End')
  const high = await read()
  const pct = Number(/(\d+)% advance/.exec((await cash.textContent()) ?? '')?.[1] ?? '0')
  if (pct > 0) expect(high).toBeGreaterThan(low)
  else expect(high).toBe(0)
})
