// build-art.mjs — tillgångsfabriken: genererar spelets procedurella grafik deterministiskt.
//
//   npm run build:art -w @seventh-front/app
//
// Skriver:
//   public/art/icons/<VERB>.svg       en schablonikon per verb (currentColor, 24×24)
//   public/art/wear/ink-wear-<n>.svg   slitagemasker för stämplar (CSS mask-image)
//   public/art/seals/<hus>.svg          rivalhusens sigill (P155, currentColor)
//   public/art/portraits/<id>.svg       siluettporträtt i profil, platshållare för ägarens porträtt (P155)
//   public/art/blueprints/<kategori>.svg  blåkopior per materielkategori för ritbordet (P155)
//   (förstasidor byggs ur händelsens text av makeFrontPage i art/frontpage.mjs — här bara som specimen i kontaktarket)
//   docs/ui/art/index.html             kontaktark för självgranskning (rendera med
//                                      scripts/art/render-sheet.mjs)
//
// Samma indata ger alltid samma filer. test/artFactory.test.ts underkänner om de
// incheckade filerna inte längre matchar generatorn. Se .claude/skills/art-director.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ICON_SHAPES, makeIcon } from './art/icons.mjs'
import { INK_WEAR_VARIANTS, makeInkWear } from './art/wear.mjs'
import { readPalette } from './art/core.mjs'
import { SEAL_IDS, makeSeal } from './art/seals.mjs'
import { PERSON_IDS, makeSilhouette } from './art/silhouettes.mjs'
import { BLUEPRINT_CATEGORIES, makeBlueprint } from './art/blueprints.mjs'
import { SPECIMEN_PAGES, makeFrontPage } from './art/frontpage.mjs'

const APP = fileURLToPath(new URL('..', import.meta.url))
const REPO = join(APP, '..', '..')

// Alla filer fabriken äger: sökväg (relativ repots rot) → innehåll. Ren funktion, så att
// testet kan jämföra mot disken utan att skriva.
export function buildArt() {
  const files = {}
  for (const name of Object.keys(ICON_SHAPES)) files[`packages/app/public/art/icons/${name}.svg`] = makeIcon(name)
  for (let v = 1; v <= INK_WEAR_VARIANTS; v++) files[`packages/app/public/art/wear/ink-wear-${v}.svg`] = makeInkWear(v)
  const palette = readPalette()
  for (const id of SEAL_IDS) files[`packages/app/public/art/seals/${id}.svg`] = makeSeal(id)
  for (const id of PERSON_IDS) files[`packages/app/public/art/portraits/${id}.svg`] = makeSilhouette(id, palette)
  for (const category of BLUEPRINT_CATEGORIES) files[`packages/app/public/art/blueprints/${category}.svg`] = makeBlueprint(category, palette)
  files['docs/ui/art/index.html'] = contactSheet(palette)
  return files
}

function contactSheet(p) {
  const names = Object.keys(ICON_SHAPES)
  const cell = (name, size) =>
    `<figure><div class="ic" style="width:${size}px;height:${size}px">${makeIcon(name).replace('width="24" height="24"', `width="${size}" height="${size}"`)}</div><figcaption>${name}</figcaption></figure>`
  const grid = (size, cls) => `<section class="${cls}"><h2>${cls === 'steel' ? 'Stål' : 'Papper'} · ${size} px</h2><div class="grid">${names.map((n) => cell(n, size)).join('')}</div></section>`
  const stamps = Array.from({ length: INK_WEAR_VARIANTS }, (_, i) => {
    const v = i + 1
    const words = ['CLASSIFIED', 'AWARDED', 'VOID', 'URGENT', 'RECEIVED', 'TOP SECRET']
    return `<div class="stamp" style="-webkit-mask-image:url(../../../packages/app/public/art/wear/ink-wear-${v}.svg);mask-image:url(../../../packages/app/public/art/wear/ink-wear-${v}.svg)">${words[i]}</div>`
  }).join('')
  const fonts = '../../../node_modules/@fontsource'
  const face = (family, pkg, weight) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(${fonts}/${pkg}/files/${pkg}-latin-${weight}-normal.woff2) format('woff2')}`
  const seals = SEAL_IDS.map((id) => `<figure><div class="seal">${makeSeal(id)}</div><figcaption>${id}</figcaption></figure>`).join('')
  const sealsSteel = SEAL_IDS.map((id) => `<figure><div class="seal small">${makeSeal(id)}</div><figcaption>${id} · 48 px</figcaption></figure>`).join('')
  const portraits = PERSON_IDS.map((id) => `<figure><div class="portrait">${makeSilhouette(id, p)}</div><figcaption>${id}</figcaption></figure>`).join('')
  const blueprints = BLUEPRINT_CATEGORIES.map((c) => `<figure><div class="plate">${makeBlueprint(c, p)}</div><figcaption>${c}</figcaption></figure>`).join('')
  const pages = SPECIMEN_PAGES.map((spec) => `<figure><div class="page">${makeFrontPage(spec, p)}</div><figcaption>${spec.seed}</figcaption></figure>`).join('')
  return `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><title>Tillgångsfabriken — kontaktark</title>
<style>
${face('Libre Baskerville', 'libre-baskerville', 400)}${face('Libre Baskerville', 'libre-baskerville', 700)}${face('Courier Prime', 'courier-prime', 400)}
body{margin:0;padding:24px;background:${p.bg};color:${p.ink};font-family:'Archivo Narrow',Arial Narrow,sans-serif}
h1{font-size:20px;margin:0 0 16px}h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}
section{padding:16px;margin-bottom:16px;border:1px solid ${p.line};background:${p.panel}}
section.steel{background:${p.steel};color:${p['steel-ink']};border-color:#000}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:4px}
figcaption{font-size:9px;letter-spacing:.04em;opacity:.75}
.ic svg{display:block}
.stamps{display:flex;flex-wrap:wrap;gap:18px}
.stamp{display:inline-block;padding:6px 14px;border:3px solid ${p.red};color:${p.red};font:700 22px/1 'Stardos Stencil',Impact,sans-serif;letter-spacing:.08em;transform:rotate(-4deg);-webkit-mask-size:100% 100%;mask-size:100% 100%}
.stamp:nth-child(even){border-color:${p['amber-ink']};color:${p['amber-ink']};transform:rotate(3deg)}
.seal svg{width:96px;height:96px;color:${p.red}}.seal.small svg{width:48px;height:48px;color:${p['steel-ink']}}
.portrait svg{width:110px;height:110px;display:block}.plate svg{width:300px;height:auto;display:block}
.page svg{width:320px;height:auto;display:block;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.wide{display:flex;flex-wrap:wrap;gap:16px}
</style></head><body>
<h1>Tillgångsfabriken — kontaktark (genererad av build-art.mjs, ändra inte för hand)</h1>
${grid(24, 'paper')}${grid(44, 'paper')}${grid(24, 'steel')}
<section class="paper"><h2>Stämplar med slitagemask (text i DOM)</h2><div class="stamps">${stamps}</div></section>
<section class="paper"><h2>Sigill — rivalhusen (P155) · papper, 96 px</h2><div class="wide">${seals}</div></section>
<section class="steel"><h2>Sigill på stål · 48 px</h2><div class="wide">${sealsSteel}</div></section>
<section class="paper"><h2>Siluettporträtt i profil (P155) — tjänstemän, ersättare, ordförande</h2><div class="wide">${portraits}</div></section>
<section class="paper"><h2>Blåkopior per kategori (P155)</h2><div class="wide">${blueprints}</div></section>
<section class="paper"><h2>Förstasidor — specimen (P155, text i inline-SVG)</h2><div class="wide">${pages}</div></section>
</body></html>
`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = buildArt()
  let changed = 0
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(REPO, rel)
    let old = null
    try {
      old = readFileSync(abs, 'utf8')
    } catch {
      /* ny fil */
    }
    if (old === content) continue
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
    changed++
  }
  console.log(`build:art — ${Object.keys(files).length} filer, ${changed} ändrade`)
}
