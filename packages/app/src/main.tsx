import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
// P73 (ETAPP7_TEKNISK_SPEC.md §10): paketerade typsnitt via @fontsource — bundlas med appen,
// fungerar offline oavsett service worker (§0.5:s eget fynd: den gamla "systemtypsnitt för
// offline"-motiveringen höll aldrig, ingen service worker fanns). Bara de vikter mockuperna
// (docs/ui/reference/) och komponentbiblioteket faktiskt använder.
import '@fontsource/archivo-narrow/500.css'
import '@fontsource/archivo-narrow/600.css'
import '@fontsource/archivo-narrow/700.css'
import '@fontsource/courier-prime/400.css'
import '@fontsource/courier-prime/700.css'
import '@fontsource/stardos-stencil/400.css'
import '@fontsource/stardos-stencil/700.css'
import '@fontsource/libre-baskerville/400.css'
import '@fontsource/libre-baskerville/400-italic.css'
import './styles.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('#root saknas i index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// P74 (ETAPP7_TEKNISK_SPEC.md §10): service workern registreras bara i en
// byggd app, aldrig under `vite dev` — e2e-svepet (play-20-turns.spec.ts m.fl.)
// kör mot devservern och skulle annars riskera att en tidigare körnings
// cachade svar läcker in i nästa, ett helt orelaterat sorts flak än det
// filen själv varnar för. `npm run build && npm run preview` är rätt sätt
// att pröva installerbarheten manuellt.
if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort, samma princip som persistence.ts:s egna förkastade löften
      // — ett misslyckat SW-registreringsförsök ska aldrig krascha appen.
    })
  })
}
