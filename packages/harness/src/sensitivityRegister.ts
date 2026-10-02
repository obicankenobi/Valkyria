// sensitivityRegister — laddas med `node --import` i en barnprocess och registrerar sensitivityHook med det tal och den faktor som
// orkestratorn (sensitivityRun.ts) skickat i miljön; HARNESS_BALANCE_SET ({"nyckel": värde}) sätter tal till fasta värden. Utan någon av dem
// registreras en inaktiv krok (utgångsläget).
import { register } from 'node:module'

register('./sensitivityHook.js', {
  parentURL: import.meta.url,
  data: {
    key: process.env['HARNESS_BALANCE_KEY'] ?? '',
    factor: Number(process.env['HARNESS_BALANCE_FACTOR'] ?? '1'),
    set: JSON.parse(process.env['HARNESS_BALANCE_SET'] ?? '{}') as Record<string, unknown>,
  },
})
