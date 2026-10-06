// @vitest-environment jsdom
// panelInfo.test.tsx — P163 (ETAPP10_FORSLAG.md §3b, S3): varje panel har en info-ikon. Två skydd:
//  1. TypeScript — `info` är en obligatorisk prop på Panel och DsPanel, så en panel utan den kompilerar inte (`npm run typecheck`).
//  2. Det här testet — läser varje källfil med TypeScripts egen parser och fäller varje <Panel>/<DsPanel> som saknar `info` eller har en tom text,
//     och renderar båda komponenterna för att visa att ikonen faktiskt hamnar i rubrikbandet och öppnar förklaringen.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { DsPanel } from '../src/components/designSystem.js'
import { Panel } from '../src/components/ui.js'
import { HandbookContext } from '../src/uiContext.js'

afterEach(cleanup)

const SRC = join(import.meta.dirname, '../src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return sourceFiles(path)
    return e.name.endsWith('.tsx') ? [path] : []
  })
}

export function panelsWithoutInfo(file: string, source: string): { file: string; line: number; tag: string }[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: { file: string; line: number; tag: string }[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf)
      if (tag === 'Panel' || tag === 'DsPanel') {
        const info = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'info')
        const empty =
          info !== undefined &&
          ts.isJsxAttribute(info) &&
          info.initializer !== undefined &&
          ts.isStringLiteral(info.initializer) &&
          info.initializer.text.trim().length < 20
        if (!info || empty) found.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, tag })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe('varje panel har en info-ikon', () => {
  it('ingen <Panel> eller <DsPanel> i packages/app/src saknar en riktig info-text', () => {
    const missing = sourceFiles(SRC).flatMap((f) => panelsWithoutInfo(relative(SRC, f), readFileSync(f, 'utf8')))
    expect(missing).toEqual([])
  })

  it('testet fäller en panel utan info, och en med en tom text', () => {
    expect(panelsWithoutInfo('x.tsx', 'const a = <Panel title="A">x</Panel>')).toHaveLength(1)
    expect(panelsWithoutInfo('x.tsx', 'const a = <DsPanel title="A" right={null}>x</DsPanel>')).toHaveLength(1)
    expect(panelsWithoutInfo('x.tsx', 'const a = <Panel title="A" info="">x</Panel>')).toHaveLength(1)
    expect(panelsWithoutInfo('x.tsx', 'const a = <Panel title="A" info="What this panel is for, in a sentence.">x</Panel>')).toHaveLength(0)
  })
})

describe('info-ikonen i rubrikbandet', () => {
  it.each([
    ['Panel', Panel, '.panel-head'],
    ['DsPanel', DsPanel, '.ds-panel-head'],
  ])('%s: ikonen sitter i rubrikbandet och öppnar förklaringen vid ett tryck', (_name, Component, headSelector) => {
    const { container } = render(
      <Component title="Fronts" info="Where the formations fight and who is ahead.">
        body
      </Component>,
    )
    const head = container.querySelector(headSelector)!
    expect(head.querySelector('[data-testid="panel-info"]')).not.toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.click(screen.getByLabelText('More information'))
    expect(screen.getByRole('tooltip').textContent).toContain('Where the formations fight')
  })

  it('"More" öppnar handboksuppslaget när panelen har ett ämne och en handbok finns', () => {
    const open = vi.fn()
    render(
      <HandbookContext.Provider value={open}>
        <Panel title="Stations" info="Your intelligence stations and how deep they see." infoTopic="intelligence">
          body
        </Panel>
      </HandbookContext.Provider>,
    )
    fireEvent.click(screen.getByLabelText('More information'))
    fireEvent.click(screen.getByText('More →'))
    expect(open).toHaveBeenCalledWith('intelligence')
  })

  it('utan ämne, eller utan handbok i trädet, visas ingen "More"-länk', () => {
    render(
      <Panel title="Stations" info="Your intelligence stations and how deep they see.">
        body
      </Panel>,
    )
    fireEvent.click(screen.getByLabelText('More information'))
    expect(screen.queryByText('More →')).toBeNull()
  })
})
