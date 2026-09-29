#!/usr/bin/env node
// perf.mjs — P94 (ETAPP7_TEKNISK_SPEC.md §12 punkt 5, "Prestandabudgeten mätt på
// riktiga telefoner"). EN SYNTETISK PROXY, INTE EN TELEFONMÄTNING: en riktig
// telefon går inte att nå från den här miljön. Skriptet mäter det som går att
// mäta i en emulerad Chromium (390×844, pekskärm, 4× CPU-strypning, "Slow 4G"-
// nätverk enligt Lighthouse: 1,6 Mbit/s ned, 750 kbit/s upp, 150 ms RTT) mot den
// BYGGDA bunten — inte dev-servern, som skickar hundratals ombundlade moduler:
//
//   1. Första inläsning: navigering → huvudmenyn användbar, tre kalla körningar,
//      medianen (§12: "under 3 s på 4G"), plus överförda byte.
//   2. Bildtakt vid panorering av kartan med omgivningsrörelsen igång, 4× CPU
//      (§12: minst 50/s på en iPhone från de senaste fyra åren, 30/s på en
//      Android i mellanklass).
//
// Emulering ersätter inte hårdvara: GPU-rastrering, minnestryck och termisk
// strypning på en verklig telefon finns inte här. Siffrorna är en golvkontroll
// ("är det uppenbart trasigt?"), inte ett godkännande — ett godkännande kräver en
// riktig enhet. Ingår inte i CI (tidsmått är för brusiga för ett test).
//
//   npm run build && npm run perf --workspace=packages/app
import { existsSync } from 'node:fs'
import { get as httpGet } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const PORT = 4189
const URL_BASE = `http://localhost:${PORT}`

const PHONE = { width: 390, height: 844 }
const CPU_THROTTLE = 4
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 }
const COLD_LOADS = 3
const PAN_SECONDS = 6

function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = httpGet(url, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`Timed out waiting for ${url}`))
        else setTimeout(attempt, 300)
      })
    }
    attempt()
  })
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

async function newPhoneContext(browser) {
  return browser.newContext({ viewport: PHONE, deviceScaleFactor: 3, hasTouch: true, isMobile: true })
}

async function measureColdLoad(browser) {
  const context = await newPhoneContext(browser)
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  let bytes = 0
  await client.send('Network.enable')
  client.on('Network.loadingFinished', (event) => {
    bytes += event.encodedDataLength
  })
  await client.send('Network.emulateNetworkConditions', SLOW_4G)
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

  const start = Date.now()
  await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('menu-new-game').waitFor()
  const usableMs = Date.now() - start
  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return fcp ? fcp.startTime : null
  })
  await context.close()
  return { usableMs, fcpMs: paint, kilobytes: Math.round(bytes / 1024) }
}

async function measurePanning(browser) {
  const context = await newPhoneContext(browser)
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

  await page.goto(URL_BASE)
  await page.getByTestId('menu-new-game').click()
  await page.getByTestId('newgame-submit').click()
  await page.getByTestId('briefing-begin').click()
  await page.getByTestId('theatre-map-svg').waitFor()
  await page.waitForTimeout(1500)

  // Bildruteintervall ur requestAnimationFrame under hela panoreringen.
  await page.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(now - last)
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const box = await page.getByTestId('theatre-map-svg').boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const started = Date.now()
  let angle = 0
  while (Date.now() - started < PAN_SECONDS * 1000) {
    angle += 0.25
    await page.mouse.move(cx + Math.cos(angle) * 60, cy + Math.sin(angle) * 60)
  }
  await page.mouse.up()

  const result = await page.evaluate(() => {
    const frames = window.__frames.slice(5) // hoppa över det första, ofullständiga intervallet
    const sorted = [...frames].sort((a, b) => a - b)
    const total = frames.reduce((sum, f) => sum + f, 0)
    return {
      frames: frames.length,
      averageFps: (frames.length * 1000) / total,
      p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      over50ms: frames.filter((f) => f > 50).length / frames.length,
      ambientOff: document.documentElement.dataset.ambient === 'off',
    }
  })
  await context.close()
  return result
}

async function main() {
  const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: APP_DIR, stdio: 'ignore' })
  try {
    await waitForServer(URL_BASE)
    const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {})

    const loads = []
    for (let i = 0; i < COLD_LOADS; i++) loads.push(await measureColdLoad(browser))
    const panning = await measurePanning(browser)
    await browser.close()

    const summary = {
      note: 'SYNTETISK PROXY (emulerad Chromium), inte en telefon',
      emulation: { viewport: PHONE, cpuThrottle: CPU_THROTTLE, network: 'Slow 4G (1,6 Mbit/s, 150 ms RTT)' },
      firstLoad: {
        usableMsRuns: loads.map((l) => l.usableMs),
        usableMsMedian: median(loads.map((l) => l.usableMs)),
        fcpMsMedian: median(loads.map((l) => l.fcpMs ?? 0)),
        kilobytes: loads[0].kilobytes,
        budgetMs: 3000,
      },
      panning: { ...panning, budgetFps: { iphone: 50, midrangeAndroid: 30 } },
    }
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    preview.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
