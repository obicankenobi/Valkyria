#!/usr/bin/env node
// shots.mjs — "Claude Code ser det den bygger" (ETAPP7_TEKNISK_SPEC.md §11.3
// arbetssätt 2). Startar appens devserver + en enkel statisk server för
// docs/ui/reference/, renderar varje registrerad skärm i telefon- (390×844,
// pekskärm emulerad) och skrivbordsformat (1440×900) till docs/ui/current/,
// och renderar de tre godkända referensskisserna till PNG i telefonformat så
// att bygge och facit kan jämföras sida vid sida. Ett dev-verktyg, inte ett
// CI-test — se e2e/text-overflow.spec.ts för regel 18:s automatiska kontroll.
//
// Skärmlistan är avsiktligt kort i P73 (bara komponentsidan, det enda NYA denna
// prompt bygger) — utökas i takt med att fler skärmar i etapp 7 färdigställs
// (7B+), samma sorts växande lista som resten av projektets checkade-in skript.
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createServer, get as httpGet } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const APP_DIR = fileURLToPath(new URL('..', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const REFERENCE_DIR = join(REPO_ROOT, 'docs/ui/reference')
const OUT_DIR = join(REPO_ROOT, 'docs/ui/current')
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'

const APP_PORT = 4186
const REFERENCE_PORT = 4187

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 900 }

// Skärmar denna prompt bygger. `path` är appens query-styrda ingång
// (samma ?screen=-mönster som App.tsx:s wantsComponentLibrary()).
const APP_SCREENS = [{ name: 'components', path: '/?screen=components' }]

const REFERENCE_FILES = [
  'operations-1-start.html',
  'operations-2-country-selected.html',
  'operations-3-configure-action.html',
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// Node 22:s inbyggda fetch (undici) avvisar vissa portar rakt av ("bad port",
// samma spärrlista webbläsare använder) INNAN något anrop ens görs — träffade
// flera av de först valda utvecklingsportarna i den här sandlådan. Node:s
// egen http-modul har ingen sådan spärr, så väntan görs med den i stället.
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

function startReferenceServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname
      const filePath = join(REFERENCE_DIR, decodeURIComponent(urlPath))
      const body = await readFile(filePath)
      res.writeHead(200, { 'content-type': MIME[extname(filePath)] ?? 'application/octet-stream' })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(REFERENCE_PORT, () => resolve(server))
  })
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log(`Startar appens devserver på :${APP_PORT}...`)
  const devServer = spawn('npm', ['run', 'dev', '--', '--port', String(APP_PORT), '--strictPort'], {
    cwd: APP_DIR,
    stdio: 'ignore',
  })
  const referenceServer = await startReferenceServer()
  console.log(`Referensserver på :${REFERENCE_PORT}...`)

  try {
    await waitForServer(`http://localhost:${APP_PORT}`)

    const browser = await chromium.launch(
      existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {},
    )

    for (const format of ['phone', 'desktop']) {
      const viewport = format === 'phone' ? PHONE : DESKTOP
      const context = await browser.newContext({
        viewport,
        hasTouch: format === 'phone',
        isMobile: format === 'phone',
      })
      const page = await context.newPage()

      for (const screen of APP_SCREENS) {
        await page.goto(`http://localhost:${APP_PORT}${screen.path}`)
        await page.waitForTimeout(300)
        const outPath = join(OUT_DIR, `${screen.name}-${format}.png`)
        await page.screenshot({ path: outPath, fullPage: true })
        console.log(`  ${outPath}`)
      }

      if (format === 'phone') {
        for (const file of REFERENCE_FILES) {
          await page.goto(`http://localhost:${REFERENCE_PORT}/${file}`)
          await page.waitForTimeout(300)
          const outPath = join(OUT_DIR, `reference-${file.replace('.html', '')}.png`)
          await page.screenshot({ path: outPath })
          console.log(`  ${outPath}`)
        }
      }

      await context.close()
    }

    await browser.close()
    console.log(`Klart. Skärmdumpar i ${OUT_DIR}`)
  } finally {
    devServer.kill()
    referenceServer.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
