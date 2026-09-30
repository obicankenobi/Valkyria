// art/render-sheet.mjs — renderar kontaktarket (docs/ui/art/index.html) till PNG så att
// Claude Code kan TITTA på grafiken den genererat (Read på PNG:n) innan den kopplas in.
//
//   node packages/app/scripts/art/render-sheet.mjs [utfil.png]
//
// Serveras över http (inte file://), eftersom Chromium vägrar CSS-masker från file://.
// Ett utvecklarverktyg, inte ett test; PNG:n checkas inte in (docs/ui/art/*.png ignoreras).
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const REPO = fileURLToPath(new URL('../../../..', import.meta.url))
const OUT = process.argv[2] ?? join(REPO, 'docs/ui/art/sheet.png')
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium'
const TYPES = { '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' }

const server = createServer(async (req, res) => {
  const path = normalize(join(REPO, decodeURIComponent(new URL(req.url, 'http://x').pathname)))
  if (!path.startsWith(REPO)) return res.writeHead(403).end()
  try {
    const body = await readFile(path)
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body)
  } catch {
    res.writeHead(404).end()
  }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const { port } = server.address()

const browser = await chromium.launch(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {})
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 })
  await page.goto(`http://127.0.0.1:${port}/docs/ui/art/index.html`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: OUT, fullPage: true })
  console.log(`render-sheet — ${OUT}`)
} finally {
  await browser.close()
  server.close()
}
