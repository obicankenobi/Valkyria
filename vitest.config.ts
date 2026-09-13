import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // P0 kräver att `npm test` passerar med noll tester (inget paket har testfiler än).
    // Utan detta failar vitest på "no test files found" och P0:s klart-när-villkor kan
    // aldrig uppfyllas ärligt.
    passWithNoTests: true,
  },
})
