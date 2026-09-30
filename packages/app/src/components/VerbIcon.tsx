// VerbIcon — ett verbs ikon ur tillgångsfabriken (public/art/icons/<VERB>.svg, scripts/art/icons.mjs).
//
// Ikonerna är ritade med stroke="currentColor", men en SVG som laddas via <img> kan inte ärva
// textfärgen. Därför ritas de som en CSS-mask: elementet får bakgrundsfärgen currentColor och SVG:n
// klipper ut formen. Då följer ikonen textfärgen överallt — papper, stål, röd stämpel — och det finns
// ingen text i elementet för regel 18-testet att mäta. Dekorativ (aria-hidden): etiketten bredvid är
// det som läses upp.
import type { CSSProperties } from 'react'
import { VERB_ICON } from '../verbIcons.js'

export function VerbIcon({ verb }: { verb: string }) {
  const url = VERB_ICON[verb]
  if (!url) return <span className="verb-icon is-unknown" aria-hidden="true" />
  return <span className="verb-icon" aria-hidden="true" style={{ '--verb-icon': `url(${url})` } as CSSProperties} />
}
