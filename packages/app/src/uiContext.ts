// uiContext — P163 (ETAPP10_FORSLAG.md §3b): två små React-kontexter som låter djupt nästlade komponenter (ett handlingskort, en panels info-ikon) nå två saker
// som bara App.tsx äger: handboken och det verb spelaren valde i Actions-menyn.
//
// Båda är valfria — en komponent som renderas utan provider (de flesta enhetstester) får `null` och döljer då bara handboks-länken respektive markeringen.
import { createContext, useContext } from 'react'
import type { HandbookTopicId } from './handbook.js'

export const HandbookContext = createContext<((topic: HandbookTopicId) => void) | null>(null)
export function useOpenHandbook(): ((topic: HandbookTopicId) => void) | null {
  return useContext(HandbookContext)
}

// `nonce` ökar vid varje val, så att samma verb valt två gånger i rad ändå räknas som ett nytt val (formulär som bygger på det monteras om).
export interface ArmedVerb {
  verb: string
  nonce: number
}
export const ArmedVerbContext = createContext<ArmedVerb | null>(null)
export function useArmedVerb(): ArmedVerb | null {
  return useContext(ArmedVerbContext)
}
