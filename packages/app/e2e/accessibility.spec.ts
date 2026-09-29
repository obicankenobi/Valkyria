// accessibility.spec.ts — P94 (ETAPP7_TEKNISK_SPEC.md §13: "Tillgänglighet").
// axe-core (WCAG 2.0/2.1 A och AA) mot varje skärm i båda formaten, samma
// skärmlista som regel 11/18-testerna (screens.ts). Underkänner vid allvarliga
// (serious) och kritiska (critical) brister; lindrigare fynd rapporteras men
// fäller inget. axe hittar det en maskin KAN hitta — det ersätter inte en
// granskning med en skärmläsare, och kartans SVG-geometri, färgkodning och
// ljud (P93) är utanför vad det kan bedöma.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { FORMATS, SCREENS } from './screens'

for (const format of FORMATS) {
  for (const screen of SCREENS) {
    test(`inga allvarliga tillgänglighetsbrister — ${screen.name}, ${format.name} (axe)`, async ({ page }) => {
      await page.setViewportSize({ width: format.width, height: format.height })
      await page.goto(screen.path)
      if (screen.setup) await screen.setup(page)
      await page.waitForTimeout(400) // låt övergångar och geodata sätta sig

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      const blocking = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')

      const report = blocking
        .map(
          (violation) =>
            `${violation.id} (${violation.impact}): ${violation.help}\n` +
            violation.nodes
              .slice(0, 4)
              .map((node) => `    ${node.target.join(' ')} — ${(node.failureSummary ?? '').split('\n')[1] ?? ''}`)
              .join('\n'),
        )
        .join('\n')
      expect(blocking, `Tillgänglighetsbrister:\n${report}`).toEqual([])
    })
  }
}
