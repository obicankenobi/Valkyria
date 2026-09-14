// playwright.config.ts — e2e-verifiering av P11:s klart när-villkor: "du kan
// spela 20 turer i webbläsaren utan att öppna konsolen" (ETAPP1_TEKNISK_SPEC.md
// avsnitt 10). Körs separat från vitest (npm test) — en annan testrunner, en
// annan filändelse (*.spec.ts), ingen kollision med vitest.config.ts:s
// packages/*/test/**/*.test.ts-mönster.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  webServer: {
    command: 'npm run dev -- --port 4174 --strictPort',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    cwd: import.meta.dirname,
  },
  use: {
    baseURL: 'http://localhost:4174',
    // Den pinnade @playwright/test-versionen förväntar sig en nyare
    // Chromium-revision än den som redan ligger förinstallerad i miljön
    // (/opt/pw-browsers) — peka explicit dit i stället för att låta Playwright
    // försöka ladda ner en ny (nätverket tillåter det inte här ändå).
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium',
    },
  },
})
