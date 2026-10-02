// sensitivityHook.test.ts — P140: laddningskroken byter balans-datan i den process som registrerar den, och rör inget annat.
import { describe, expect, it } from 'vitest'
import { initialize, load } from '../src/sensitivityHook.js'

const original = JSON.stringify({ techMarginWeight: 0.25, blocTechLevelStep: 0, other: 10 })
const nextLoad = async (): Promise<{ format: string; source: string }> => ({ format: 'json', source: original })

describe('sensitivityHook', () => {
  it('utan ändring släpps filen igenom oförändrad', async () => {
    initialize({ key: '', factor: 1 })
    const result = await load('file:///x/core/dist/data/balance.json', {}, nextLoad)
    expect(result.source).toBe(original)
  })

  it('skalar ett tal i balance.json och rör inte andra filer', async () => {
    initialize({ key: 'techMarginWeight', factor: 1.25 })
    const changed = await load('file:///x/core/dist/data/balance.json', {}, nextLoad)
    expect(JSON.parse(changed.source as string)).toEqual({ techMarginWeight: 0.3125, blocTechLevelStep: 0, other: 10 })
    expect(changed.shortCircuit).toBe(true)
    const other = await load('file:///x/core/dist/data/products.json', {}, nextLoad)
    expect(other.source).toBe(original)
  })

  it('sätter ett tal till ett fast värde (blocTechLevelStep 0 → 1) utan att skala något', async () => {
    initialize({ key: '', factor: 1, set: { blocTechLevelStep: 1 } })
    const changed = await load('file:///x/core/dist/data/balance.json', {}, nextLoad)
    expect(JSON.parse(changed.source as string)).toEqual({ techMarginWeight: 0.25, blocTechLevelStep: 1, other: 10 })
    initialize(undefined) // städa: kroken är modulglobal
  })
})
