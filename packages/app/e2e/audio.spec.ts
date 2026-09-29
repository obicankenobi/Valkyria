// audio.spec.ts — P93 (ETAPP7_TEKNISK_SPEC.md §10/§13, docs/LJUDTILLGANGAR.md
// avsnitt 5). jsdom saknar AudioContext, så enhetstesterna bevisar bara att
// motorn TIGER. Det här bevisar det motsatta i en riktig webbläsare: att musik
// och miljöljud faktiskt begärs när de ska, inte före första trycket
// (autoplay-policyn), och att inget av det ger ett konsolfel eller sidfel.
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(String(error)))
  return errors
}

function trackRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/music/') || url.pathname.startsWith('/sounds/')) urls.push(url.pathname)
  })
  return urls
}

test('inget ljud begärs före första trycket, sedan startar titelmusiken', async ({ page }) => {
  const errors = trackErrors(page)
  const requested = trackRequests(page)

  await page.goto('/')
  await page.getByTestId('menu-new-game').waitFor()
  await page.waitForTimeout(500)
  expect(requested.filter((path) => path.startsWith('/music/'))).toEqual([])

  const titleRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/music/title.mp3')
  await page.getByTestId('menu-handbook').click()
  await titleRequest

  expect(errors).toEqual([])
})

test('i spelet byter musiken till lugn kartmusik och rumsljudet startar', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/')
  await page.getByTestId('menu-new-game').click()

  const calmRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/music/ops-calm-a.mp3')
  const roomToneRequest = page.waitForRequest((request) => new URL(request.url()).pathname === '/sounds/room-tone.mp3')
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('hud').waitFor()

  await calmRequest
  await roomToneRequest

  expect(errors).toEqual([])
})

test('titelmusiken SPELAS på riktigt: ett mediaelement är igång och tiden går framåt', async ({ page }) => {
  const errors = trackErrors(page)
  // `new Audio()`-element hamnar aldrig i DOM:en — fånga dem vid skapandet.
  await page.addInitScript(() => {
    const created: HTMLAudioElement[] = []
    ;(window as unknown as { __audios: HTMLAudioElement[] }).__audios = created
    const Original = window.Audio
    window.Audio = function (this: unknown, src?: string) {
      const element = new Original(src)
      created.push(element)
      return element
    } as unknown as typeof Audio
  })

  await page.goto('/')
  await page.getByTestId('menu-new-game').waitFor()
  await page.getByTestId('menu-handbook').click()

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const audios = (window as unknown as { __audios: HTMLAudioElement[] }).__audios
          const playing = audios.find((a) => !a.paused && a.currentTime > 0.3)
          return playing ? new URL(playing.currentSrc).pathname : null
        }),
      { timeout: 15_000 },
    )
    .toBe('/music/title.mp3')

  expect(errors).toEqual([])
})

test('ett tryck på en knapp begär klickljudet, utan konsolfel även när filen saknas', async ({ page }) => {
  const errors = trackErrors(page)

  await page.goto('/')
  const clickSound = page.waitForRequest((request) => new URL(request.url()).pathname === '/sounds/button-press.mp3')
  await page.getByTestId('menu-handbook').click()
  await clickSound

  expect(errors).toEqual([])
})
