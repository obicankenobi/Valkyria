// uiLanguage.test.ts — P162 (ETAPP10_FORSLAG.md §3b, S1): all text i gränssnittet är på engelska.
// Testet läser varje källfil i packages/app/src med TypeScripts egen parser och prövar bara det som kan nå skärmen:
// strängliteraler, mallsträngar och JSX-text. Kommentarer (som får vara svenska) och identifierare rörs aldrig.
// Utvecklarsidan ?screen=components (ComponentLibrary.tsx) är undantagen.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

const SRC = join(import.meta.dirname, '../src')
const EXEMPT = new Set(['components/ComponentLibrary.tsx'])

// Bokstäver som inte finns i engelskan, och en ordlista över vanliga svenska ord. Hela ord, gemener.
const SWEDISH_LETTERS = /[åäöÅÄÖ]/
const SWEDISH_WORDS = [
  'och', 'att', 'inte', 'eller', 'som', 'från', 'vilken', 'vilket', 'denna', 'här', 'ingen', 'inga', 'finns', 'men', 'också', 'sektor',
  'huvudstad', 'förband', 'förbandsbricka', 'styrka', 'tryck', 'öppna', 'stäng', 'spara', 'kontrollerar', 'motståndaren', 'tjänstemän',
  'underrättelse', 'försörjningslinje', 'teckenförklaring', 'kvartal', 'betyder', 'saknar', 'jämfört', 'ditt', 'dina', 'mycket', 'nästa',
]
const SWEDISH_WORD_RE = new RegExp(`(?<![\\p{L}])(${SWEDISH_WORDS.join('|')})(?![\\p{L}])`, 'u')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [path] : []
  })
}

interface Hit {
  file: string
  line: number
  text: string
  why: string
}

export function swedishHits(file: string, source: string): Hit[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const hits: Hit[] = []
  const check = (node: ts.Node, text: string): void => {
    const clean = text.trim()
    if (!clean) return
    const why = SWEDISH_LETTERS.test(clean) ? 'svenskt tecken' : SWEDISH_WORD_RE.exec(clean.toLowerCase())?.[1]
    if (why) hits.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, text: clean.slice(0, 70), why })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) check(node, node.text)
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) check(node, node.text)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hits
}

describe('språk: gränssnittet är på engelska (S1)', () => {
  it('ingen sträng, mallsträng eller JSX-text i packages/app/src är på svenska', () => {
    const hits = sourceFiles(SRC)
      .filter((f) => !EXEMPT.has(relative(SRC, f).replace(/\\/g, '/')))
      .flatMap((f) => swedishHits(relative(SRC, f), readFileSync(f, 'utf8')))
    expect(hits.map((h) => `${h.file}:${h.line} [${h.why}] ${h.text}`)).toEqual([])
  })

  it('testet fångar svenska — i strängar, mallsträngar och JSX, men inte i kommentarer', () => {
    const code = [
      "// Detta är en kommentar på svenska och får vara det",
      "const a = 'Sektor du kontrollerar'",
      'const b = `Antal ${1} öppna`',
      'const c = <p>Tryck för att öppna</p>',
      "const d = 'Open orders'",
    ].join('\n')
    const hits = swedishHits('x.tsx', code)
    expect(hits.map((h) => h.line)).toEqual([2, 3, 4])
  })
})
